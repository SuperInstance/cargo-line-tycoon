/**
 * Quilt Substrate SDK — Browser-native
 * 
 * Single-file ES module. Drop into any HTML page:
 *   <script type="module">
 *     import { Substrate } from './substrate-sdk.js';
 *     const s = new Substrate();
 *     s.add('hello world');
 *     console.log(s.cells);
 *   </script>
 * 
 * Or as inline copy-paste.
 */

// ─── Primitives ──────────────────────────────────────────

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MASK = (1n << 64n) - 1n;

export function fnv1a64(str) {
  let h = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h = (h ^ BigInt(c & 0xff)) & FNV_MASK;
    h = (h * FNV_PRIME) & FNV_MASK;
    if (c > 0xff) {
      h = (h ^ BigInt((c >> 8) & 0xff)) & FNV_MASK;
      h = (h * FNV_PRIME) & FNV_MASK;
    }
    if (c > 0xffff) {
      h = (h ^ BigInt((c >> 16) & 0xff)) & FNV_MASK;
      h = (h * FNV_PRIME) & FNV_MASK;
      h = (h ^ BigInt((c >> 24) & 0xff)) & FNV_MASK;
      h = (h * FNV_PRIME) & FNV_MASK;
    }
  }
  return h;
}

export const FLEET_CANARY = fnv1a64('café Δ 日本語'); // 0x024a555471370b18d
export const FLEET_CANARY_HEX = '0x' + FLEET_CANARY.toString(16).padStart(16, '0');

// ─── Local embedder ──────────────────────────────────────

export class LocalEmbedder {
  constructor(dim = 32) {
    this.dim = dim;
    this.W = Array.from({length: dim}, () =>
      Array.from({length: 256}, () => Math.random() * 2 - 1)
    );
  }
  
  embed(text) {
    const features = new Array(256).fill(0);
    for (let i = 0; i < text.length; i++) {
      features[text.charCodeAt(i) & 0xff] += 1;
      if (i + 1 < text.length) {
        features[(text.charCodeAt(i) + text.charCodeAt(i+1) * 7) & 0xff] += 0.5;
      }
    }
    const emb = new Array(this.dim).fill(0);
    for (let i = 0; i < this.dim; i++) {
      for (let j = 0; j < 256; j++) {
        emb[i] += features[j] * this.W[i][j];
      }
      emb[i] /= 16;
    }
    return emb;
  }
}

// ─── Cell ────────────────────────────────────────────────

export class Cell {
  constructor(id, type = 'canon', state = {}) {
    this.id = id;
    this.type = type;
    this.state = state;
    this.embedding = null;
    this.witness_chain = [];
    this.prev_hash = '0x' + '0'.repeat(16);
    this.timestamp = 0;
  }
  
  witness() {
    const stateJson = JSON.stringify(this.state, Object.keys(this.state).sort());
    const entry = {
      cell_id: this.id,
      step: this.timestamp,
      state: { ...this.state },
      prev_hash: this.prev_hash,
      hash: '0x' + fnv1a64(stateJson).toString(16).padStart(16, '0'),
    };
    this.witness_chain.push(entry);
    this.prev_hash = entry.hash;
    this.timestamp++;
    return entry;
  }
}

// ─── Substrate ───────────────────────────────────────────

export class Substrate {
  constructor() {
    this.cells = new Map();
    this.witness_log = [];
    this.embedder = new LocalEmbedder(32);
  }
  
  add(id, type, state = {}) {
    if (typeof id === 'object') {
      // add(cellObj)
      const cell = id;
      this.cells.set(cell.id, cell);
      cell.embedding = cell.embedding || this.embedder.embed(JSON.stringify(cell.state));
      const w = cell.witness();
      this.witness_log.push(w);
      return cell;
    }
    
    // add(id, type, state)
    const cell = new Cell(id, type, state);
    cell.embedding = this.embedder.embed(JSON.stringify(state));
    this.cells.set(id, cell);
    const w = cell.witness();
    this.witness_log.push(w);
    return cell;
  }
  
  get(id) {
    return this.cells.get(id);
  }
  
  set(id, newState) {
    const cell = this.cells.get(id);
    if (!cell) return;
    cell.state = newState;
    cell.embedding = this.embedder.embed(JSON.stringify(newState));
    const w = cell.witness();
    this.witness_log.push(w);
    return cell;
  }
  
  cosine(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
  }
  
  findTopK(queryOrEmbedding, k = 5) {
    const embedding = typeof queryOrEmbedding === 'string'
      ? this.embedder.embed(queryOrEmbedding)
      : queryOrEmbedding;
    
    const scored = [];
    for (const cell of this.cells.values()) {
      if (!cell.embedding) continue;
      const score = this.cosine(embedding, cell.embedding);
      scored.push({ cell, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
  
  wavefunction(queryOrEmbedding, phaseMode = 'cluster') {
    const embedding = typeof queryOrEmbedding === 'string'
      ? this.embedder.embed(queryOrEmbedding)
      : queryOrEmbedding;
    
    const amps = [];
    let i = 0;
    for (const cell of this.cells.values()) {
      if (!cell.embedding) continue;
      const sim = this.cosine(embedding, cell.embedding);
      let phase;
      if (phaseMode === 'cluster') {
        phase = (cell.id.charCodeAt(cell.id.length - 1) * 0.123) % (2 * Math.PI);
      } else if (phaseMode === 'random') {
        phase = Math.random() * 2 * Math.PI;
      } else {
        phase = (i++ * 0.01) % (2 * Math.PI);
      }
      amps.push({ re: sim * Math.cos(phase), im: sim * Math.sin(phase), cell });
    }
    
    let psiRe = 0, psiIm = 0;
    for (const a of amps) { psiRe += a.re; psiIm += a.im; }
    const psiMag = Math.sqrt(psiRe * psiRe + psiIm * psiIm);
    
    let totalPower = 0, constructive = 0, destructive = 0;
    for (const a of amps) totalPower += a.re * a.re + a.im * a.im;
    for (let i = 0; i < amps.length; i++) {
      for (let j = i + 1; j < amps.length; j++) {
        const cross = amps[i].re * amps[j].re + amps[i].im * amps[j].im;
        if (cross > 0) constructive += cross;
        else destructive += cross;
      }
    }
    
    return {
      psiMagnitude: psiMag,
      totalPower,
      coherence: (psiMag * psiMag) / Math.max(totalPower, 1e-12),
      constructive, destructive,
      ratio: constructive / Math.max(Math.abs(destructive), 1e-12),
      amps,
    };
  }
  
  // Opcodes
  BIND(aId, bId) {
    const a = this.cells.get(aId), b = this.cells.get(bId);
    if (!a || !b) return false;
    a.state.bound_to = (a.state.bound_to || []);
    if (!a.state.bound_to.includes(bId)) a.state.bound_to.push(bId);
    b.state.bound_to = (b.state.bound_to || []);
    if (!b.state.bound_to.includes(aId)) b.state.bound_to.push(aId);
    this.set(aId, a.state);
    this.set(bId, b.state);
    return true;
  }
  
  ATTEST(cellId, evidence) {
    const cell = this.cells.get(cellId);
    if (!cell) return false;
    cell.state.attestations = (cell.state.attestations || []);
    cell.state.attestations.push({
      ...evidence,
      hash: '0x' + fnv1a64(JSON.stringify(evidence)).toString(16).padStart(16, '0'),
      timestamp: Date.now(),
    });
    this.set(cellId, cell.state);
    return true;
  }
  
  CONTEST(cellId, reason) {
    const cell = this.cells.get(cellId);
    if (!cell) return false;
    cell.state.contestations = (cell.state.contestations || []);
    cell.state.contestations.push({ reason, timestamp: Date.now() });
    this.set(cellId, cell.state);
    return true;
  }
  
  WITHDRAW(cellId) {
    const cell = this.cells.get(cellId);
    if (!cell) return false;
    cell.state.withdrawn = true;
    cell.state.withdrawnAt = Date.now();
    this.set(cellId, cell.state);
    return true;
  }
  
  // Persistence
  async saveToIndexedDB(dbName = 'quilt-substrate') {
    const db = await openDB(dbName);
    const tx = db.transaction(['cells', 'witnesses'], 'readwrite');
    for (const cell of this.cells.values()) {
      tx.objectStore('cells').put({
        id: cell.id,
        type: cell.type,
        state: cell.state,
        embedding: cell.embedding,
        timestamp: cell.timestamp,
        prev_hash: cell.prev_hash,
      });
    }
    for (const w of this.witness_log) {
      tx.objectStore('witnesses').put(w);
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
  }
  
  async loadFromIndexedDB(dbName = 'quilt-substrate') {
    const db = await openDB(dbName);
    const cells = await new Promise((resolve, reject) => {
      const req = db.transaction(['cells'], 'readonly').objectStore('cells').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = reject;
    });
    const witnesses = await new Promise((resolve, reject) => {
      const req = db.transaction(['witnesses'], 'readonly').objectStore('witnesses').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = reject;
    });
    
    for (const c of cells) {
      const cell = new Cell(c.id, c.type, c.state);
      cell.embedding = c.embedding;
      cell.timestamp = c.timestamp;
      cell.prev_hash = c.prev_hash;
      this.cells.set(c.id, cell);
    }
    this.witness_log = witnesses || [];
    return { cells: cells.length, witnesses: (witnesses || []).length };
  }
  
  // Distributed — talk to coordinator
  async registerWithCoordinator(coordinatorUrl, hardware = {}) {
    const resp = await fetch(`${coordinatorUrl}/api/node/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: this.nodeName, hardware }),
    });
    const data = await resp.json();
    if (data.ok) this.nodeId = data.nodeId;
    return data;
  }
  
  async submitToCoordinator(coordinatorUrl, task, result) {
    if (!this.nodeId) throw new Error('Not registered');
    const resp = await fetch(`${coordinatorUrl}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodeId: this.nodeId,
        nodeName: this.nodeName,
        task,
        result,
        hardware: this.lastHardware,
      }),
    });
    return resp.json();
  }
}

// ─── IndexedDB helper ────────────────────────────────────

function openDB(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('cells')) {
        db.createObjectStore('cells', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('witnesses')) {
        db.createObjectStore('witnesses', { keyPath: 'hash', autoIncrement: false });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = reject;
  });
}

// ─── Convenience ─────────────────────────────────────────

export function createSubstrate() {
  return new Substrate();
}

// Default export
export default {
  Substrate,
  Cell,
  LocalEmbedder,
  fnv1a64,
  FLEET_CANARY,
  FLEET_CANARY_HEX,
  createSubstrate,
};
