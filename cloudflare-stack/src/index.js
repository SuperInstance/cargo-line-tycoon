/**
 * Quilt Distributed — Full Cloudflare Stack
 * 
 * Combines:
 *   - KV: fast lookups (nodes, sessions, witness-log tail, rate limits)
 *   - D1: relational canon (cells, embeddings metadata, witness log)
 *   - R2: large blobs (model weights, embedding files, canon archives)
 *   - Vectorize: semantic search (JEV scoring)
 *   - Durable Objects: multiplayer sessions, training jobs
 *   - Workers AI: LLM inference (continuous ML), embeddings
 *   - Cron: scheduled tasks (every 5 min)
 * 
 * Endpoints:
 *   GET  /                          — Service info
 *   GET  /api/health                — Health check (KV + D1 + Vectorize + AI)
 *   POST /api/node/register         — Register a node (KV)
 *   POST /api/node/:id/heartbeat    — Heartbeat (KV)
 *   GET  /api/node/:id              — Get node (KV)
 *   GET  /api/nodes                 — List nodes (KV)
 *   POST /api/cell                  — Submit cell (D1 + Vectorize)
 *   GET  /api/cell/:id              — Get cell (D1 + R2 for full content)
 *   GET  /api/cells                 — List cells (D1)
 *   POST /api/jev/search            — Semantic search (Vectorize)
 *   POST /api/embed                 — Compute embedding (Workers AI + Vectorize)
 *   POST /api/infer                 — LLM inference (Workers AI)
 *   POST /api/submit                — Submit training result (KV + R2)
 *   GET  /api/leaderboard           — Top contributors (KV)
 *   POST /api/session/create        — Create session (Durable Object)
 *   GET  /api/session/:id           — Get session (Durable Object)
 *   POST /api/session/:id/event     — Append event (Durable Object)
 *   POST /api/training/start        — Start training (Durable Object)
 *   GET  /api/training/:id          — Get training status (Durable Object)
 *   POST /api/garden/visit          — Truman Garden visit (D1 + Vectorize)
 *   GET  /api/garden/state          — Garden state
 *   GET  /api/canon/stats           — Canon statistics
 *   POST /api/canon/attest          — Attest a cell (D1 + witness chain)
 *   GET  /api/witness/:cellId       — Get witness chain (D1)
 *   GET  /api/models                — List models (R2)
 *   GET  /api/export                — Export canon (D1 + R2)
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const jsonResponse = (obj, status = 200, headers = {}) => 
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', ...headers },
  });

const error = (msg, status = 400) => jsonResponse({ ok: false, error: msg }, status);

// ─── Durable Objects ───────────────────────────────────

// SessionDurableObject removed for simpler deploy
class SessionDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get('sessions') || {};
      this.sessions = new Map(Object.entries(stored));
    });
  }
  
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    
    if (path === '/session/get') {
      const sessionId = url.searchParams.get('id');
      const session = this.sessions.get(sessionId);
      return new Response(JSON.stringify({ ok: true, session }), { 
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
    
    if (path === '/session/append' && req.method === 'POST') {
      const body = await req.json();
      const { sessionId, event } = body;
      let session = this.sessions.get(sessionId) || { id: sessionId, players: [], events: [] };
      session.events.unshift(event);
      if (session.events.length > 100) session.events = session.events.slice(0, 100);
      if (event.type === 'JOIN' && !session.players.find(p => p.id === event.playerId)) {
        session.players.push({
          id: event.playerId,
          name: event.playerName,
          locale: event.locale,
          joinedAt: new Date().toISOString(),
        });
      }
      this.sessions.set(sessionId, session);
      await this.state.storage.put('sessions', Object.fromEntries(this.sessions));
      return new Response(JSON.stringify({ ok: true, session }), { 
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('not found', { status: 404 });
  }
}

// TrainingDurableObject removed for simpler deploy
class TrainingDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.jobs = new Map();
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get('jobs') || {};
      this.jobs = new Map(Object.entries(stored));
    });
  }
  
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    
    if (path === '/training/start' && req.method === 'POST') {
      const body = await req.json();
      const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const job = {
        id: jobId,
        ...body,
        status: 'queued',
        createdAt: new Date().toISOString(),
        progress: 0,
      };
      this.jobs.set(jobId, job);
      await this.state.storage.put('jobs', Object.fromEntries(this.jobs));
      
      // Schedule work — kick off async training
      this.env.WAITFOR(this.runJob(jobId));
      
      return new Response(JSON.stringify({ ok: true, jobId, job }), { 
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
    
    if (path === '/training/status') {
      const jobId = url.searchParams.get('id');
      const job = this.jobs.get(jobId);
      return new Response(JSON.stringify({ ok: true, job }), { 
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
    
    if (path === '/training/list') {
      return new Response(JSON.stringify({ ok: true, jobs: Array.from(this.jobs.values()) }), { 
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('not found', { status: 404 });
  }
  
  async runJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    
    job.status = 'running';
    job.progress = 0;
    await this.state.storage.put('jobs', Object.fromEntries(this.jobs));
    
    // Run inference using Workers AI for continuous ML
    try {
      const result = await this.env.AI.run(this.env.ML_MODEL || '@cf/meta/llama-3.1-8b-instruct-fast', {
        messages: [{ role: 'user', content: job.prompt || 'Generate a canonical substrate piece.' }],
        max_tokens: 500,
      });
      
      job.result = result.response || JSON.stringify(result);
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      job.progress = 1;
      await this.state.storage.put('jobs', Object.fromEntries(this.jobs));
      
      // Store result in R2 for persistence
      await this.env.MODELS.put(`training/${jobId}.json`, JSON.stringify({
        job,
        result: result.response,
        model: this.env.ML_MODEL,
        timestamp: new Date().toISOString(),
      }));
    } catch (e) {
      job.status = 'failed';
      job.error = e.message;
      await this.state.storage.put('jobs', Object.fromEntries(this.jobs));
    }
  }
}

// ─── Helpers ────────────────────────────────────────────

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function fnv1a64(str) {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = (1n << 64n) - 1n;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h = (h ^ BigInt(c & 0xff)) & mask;
    h = (h * prime) & mask;
    if (c > 0xff) {
      h = (h ^ BigInt((c >> 8) & 0xff)) & mask;
      h = (h * prime) & mask;
    }
  }
  return h;
}

async function initDB(env) {
  // Create tables if they don't exist
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS cells (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      state TEXT,
      embedding_id TEXT,
      prev_hash TEXT,
      timestamp INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      source TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS witnesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cell_id TEXT NOT NULL,
      step INTEGER NOT NULL,
      prev_hash TEXT,
      hash TEXT,
      state TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cell_id) REFERENCES cells(id)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      name TEXT,
      hardware TEXT,
      status TEXT,
      cells INTEGER DEFAULT 0,
      submissions INTEGER DEFAULT 0,
      first_seen TEXT,
      last_heartbeat TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      node_id TEXT,
      task TEXT,
      result TEXT,
      hardware TEXT,
      timestamp TEXT,
      canon_receipt TEXT
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_witnesses_cell_id ON witnesses(cell_id)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_cells_type ON cells(type)`),
  ]);
}

// ─── Main Worker ───────────────────────────────────────

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }
    
    const url = new URL(req.url);
    const path = url.pathname;
    
    try {
      // ─── Health ─────────────────────────────────────
      if (path === '/' || path === '/api/health') {
        const health = {
          ok: true,
          service: 'quilt-distributed',
          version: env.QUILT_VERSION,
          canary: env.CANARY_HASH,
          timestamp: new Date().toISOString(),
          stack: {
            kv: !!env.NODES,
            d1: !!env.DB,
            r2: !!env.MODELS,
            vectorize: !!env.JEV_INDEX,
            durableObjects: !!env.SESSION_DO,
            ai: !!env.AI,
          },
        };
        return jsonResponse(health);
      }
      
      // ─── Node register ────────────────────────────
      if (path === '/api/node/register' && req.method === 'POST') {
        const body = await req.json();
        const nodeId = 'node_' + crypto.randomUUID().slice(0, 8);
        const node = {
          id: nodeId,
          name: body.name || nodeId,
          hardware: body.hardware || {},
          firstSeen: new Date().toISOString(),
          lastHeartbeat: new Date().toISOString(),
          status: 'online',
          cells: 0,
          submissions: 0,
        };
        
        // KV
        await env.NODES.put(`node:${nodeId}`, JSON.stringify(node), { expirationTtl: 86400 * 7 });
        
        // D1
        await env.DB.prepare(
          `INSERT OR REPLACE INTO nodes (id, name, hardware, status, first_seen, last_heartbeat) VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(nodeId, node.name, JSON.stringify(node.hardware), 'online', node.firstSeen, node.lastHeartbeat).run();
        
        return jsonResponse({ ok: true, nodeId, node });
      }
      
      // ─── Heartbeat ─────────────────────────────────
      const heartbeatMatch = path.match(/^\/api\/node\/([^/]+)\/heartbeat$/);
      if (heartbeatMatch && req.method === 'POST') {
        const nodeId = heartbeatMatch[1];
        const body = await req.json();
        
        const existing = await env.NODES.get(`node:${nodeId}`);
        if (!existing) return error('unknown node', 404);
        
        const node = JSON.parse(existing);
        node.lastHeartbeat = new Date().toISOString();
        node.status = body.status || node.status;
        node.cells = body.cells || node.cells;
        node.hardware = body.hardware || node.hardware;
        
        await env.NODES.put(`node:${nodeId}`, JSON.stringify(node), { expirationTtl: 86400 * 7 });
        await env.DB.prepare(
          `UPDATE nodes SET status = ?, cells = ?, last_heartbeat = ?, hardware = ? WHERE id = ?`
        ).bind(node.status, node.cells, node.lastHeartbeat, JSON.stringify(node.hardware), nodeId).run();
        
        return jsonResponse({ ok: true, node });
      }
      
      // ─── Get node ──────────────────────────────────
      const nodeMatch = path.match(/^\/api\/node\/([^/]+)$/);
      if (nodeMatch && req.method === 'GET') {
        const node = await env.NODES.get(`node:${nodeMatch[1]}`);
        if (!node) return error('unknown', 404);
        return jsonResponse({ ok: true, node: JSON.parse(node) });
      }
      
      // ─── List nodes ────────────────────────────────
      if (path === '/api/nodes' && req.method === 'GET') {
        const list = await env.NODES.list({ prefix: 'node:' });
        const nodes = [];
        for (const key of list.keys) {
          const data = await env.NODES.get(key.name);
          if (data) nodes.push(JSON.parse(data));
        }
        return jsonResponse({ ok: true, nodes, count: nodes.length });
      }
      
      // ─── Submit cell ───────────────────────────────
      if (path === '/api/cell' && req.method === 'POST') {
        const body = await req.json();
        const cellId = body.id || 'cell_' + Date.now();
        const stateJson = typeof body.state === 'string' ? body.state : JSON.stringify(body.state || {});
        const prevHash = body.prev_hash || ('0x' + '0'.repeat(16));
        
        // Compute hash
        const hash = '0x' + (await fnv1a64(cellId + stateJson + prevHash)).toString(16).padStart(16, '0');
        
        // Compute embedding if content provided
        let embeddingId = null;
        if (body.content && env.AI) {
          try {
            const embeddingResp = await env.AI.run(env.EMBED_MODEL || '@cf/baai/bge-base-en-v1.5', {
              text: body.content.slice(0, 1000),
            });
            const embedding = embeddingResp.data?.[0] || embeddingResp.embedding || embeddingResp;
            
            // Store in Vectorize
            if (env.JEV_INDEX) {
              await env.JEV_INDEX.insert([{
                id: cellId,
                values: embedding,
                metadata: { type: body.type || 'canon', text: (body.content || '').slice(0, 100) },
              }]);
            }
            
            // Store in R2
            if (env.EMBEDDINGS) {
              await env.EMBEDDINGS.put(`${cellId}.json`, JSON.stringify({
                cellId,
                embedding,
                model: env.EMBED_MODEL,
                timestamp: new Date().toISOString(),
              }));
            }
            
            embeddingId = cellId;
          } catch (e) {
            console.error('Embedding failed:', e);
          }
        }
        
        // Store in D1
        await env.DB.prepare(
          `INSERT OR REPLACE INTO cells (id, type, state, embedding_id, prev_hash, timestamp, source) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(cellId, body.type || 'canon', stateJson, embeddingId, prevHash, Date.now(), body.source || 'api').run();
        
        // Store full content in R2
        if (body.content && env.MODELS) {
          await env.MODELS.put(`cells/${cellId}.md`, body.content);
        }
        
        // Append witness
        await env.DB.prepare(
          `INSERT INTO witnesses (cell_id, step, prev_hash, hash, state) VALUES (?, ?, ?, ?, ?)`
        ).bind(cellId, body.step || 0, prevHash, hash, stateJson).run();
        
        // Witness-log tail in KV
        const tail = JSON.parse(await env.WITNESS_LOG.get('tail') || '[]');
        tail.unshift({ cellId, hash, timestamp: new Date().toISOString() });
        if (tail.length > 100) tail.length = 100;
        await env.WITNESS_LOG.put('tail', JSON.stringify(tail), { expirationTtl: 86400 * 7 });
        
        return jsonResponse({ ok: true, cellId, hash, embeddingId });
      }
      
      // ─── Get cell ──────────────────────────────────
      const cellMatch = path.match(/^\/api\/cell\/([^/]+)$/);
      if (cellMatch && req.method === 'GET') {
        const cellId = cellMatch[1];
        const cell = await env.DB.prepare('SELECT * FROM cells WHERE id = ?').bind(cellId).first();
        if (!cell) return error('not found', 404);
        
        // Parse state JSON for easy access (handle both single and double-encoded)
        let parsed = null;
        try {
          parsed = JSON.parse(cell.state || '{}');
          // If still a string after first parse, parse again (double-encoded legacy)
          if (typeof parsed === 'string') {
            try { parsed = JSON.parse(parsed); } catch (e) { parsed = null; }
          }
        } catch (e) {}
        
        // Try to load full content from R2 (cron/{cellId}.md or cells/{cellId}.md)
        let content = null;
        if (env.MODELS) {
          let obj = await env.MODELS.get(`cron/${cellId}.md`);
          if (!obj) obj = await env.MODELS.get(`cells/${cellId}.md`);
          if (obj) content = await obj.text();
        }
        
        // Also load witness chain
        let witnesses = [];
        try {
          const ws = await env.DB.prepare('SELECT * FROM witnesses WHERE cell_id = ? ORDER BY timestamp ASC').bind(cellId).all();
          witnesses = ws.results || [];
        } catch (e) {}
        
        return jsonResponse({ 
          ok: true, 
          cell, 
          text: parsed?.text || content || null,
          topic: parsed?.topic || null,
          metadata: parsed || null,
          content,
          witnesses,
        });
      }
      
      // ─── Quick text-only cell fetch ─────────────────
      const textMatch = path.match(/^\/api\/cell\/([^/]+)\/text$/);
      if (textMatch && req.method === 'GET') {
        const cellId = textMatch[1];
        const cell = await env.DB.prepare('SELECT state FROM cells WHERE id = ?').bind(cellId).first();
        if (!cell) return error('not found', 404);
        try {
          const parsed = JSON.parse(cell.state || '{}');
          return jsonResponse({ ok: true, cellId, text: parsed.text, topic: parsed.topic });
        } catch (e) {
          return error('parse error: ' + e.message, 500);
        }
      }
      
      // ─── List cells ────────────────────────────────
      if (path === '/api/cells' && req.method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const offset = parseInt(url.searchParams.get('offset') || '0');
        const type = url.searchParams.get('type');
        
        let query = 'SELECT id, type, timestamp, created_at, source FROM cells';
        let bindings = [];
        if (type) {
          query += ' WHERE type = ?';
          bindings.push(type);
        }
        query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        bindings.push(limit, offset);
        
        const result = await env.DB.prepare(query).bind(...bindings).all();
        return jsonResponse({ ok: true, cells: result.results, count: result.results.length });
      }
      
      // ─── JEV semantic search ──────────────────────
      if (path === '/api/jev/search' && req.method === 'POST') {
        const body = await req.json();
        if (!env.JEV_INDEX) return error('Vectorize not configured');
        
        // Compute query embedding
        const queryEmb = await env.AI.run(env.EMBED_MODEL || '@cf/baai/bge-base-en-v1.5', {
          text: body.query,
        });
        const queryVec = queryEmb.data?.[0] || queryEmb.embedding || queryEmb;
        
        // Search Vectorize
        const matches = await env.JEV_INDEX.query(queryVec, {
          topK: body.topK || 5,
          returnMetadata: true,
        });
        
        return jsonResponse({ ok: true, matches: matches.matches || [], query: body.query });
      }
      
      // ─── Embed text ───────────────────────────────
      if (path === '/api/embed' && req.method === 'POST') {
        const body = await req.json();
        const result = await env.AI.run(env.EMBED_MODEL || '@cf/baai/bge-base-en-v1.5', {
          text: body.text.slice(0, 2000),
        });
        return jsonResponse({ ok: true, embedding: result.data?.[0] || result.embedding });
      }
      
      // ─── LLM Inference ────────────────────────────
      if (path === '/api/infer' && req.method === 'POST') {
        const body = await req.json();
        const messages = body.messages || [{ role: 'user', content: body.prompt || 'Hello' }];
        const result = await env.AI.run(env.ML_MODEL || '@cf/meta/llama-3.1-8b-instruct-fast', {
          messages,
          max_tokens: body.max_tokens || 500,
          temperature: body.temperature || 0.7,
        });
        return jsonResponse({ ok: true, response: result.response });
      }
      
      // ─── Submit training result ──────────────────
      if (path === '/api/submit' && req.method === 'POST') {
        const body = await req.json();
        const submissionId = 'sub_' + crypto.randomUUID().slice(0, 12);
        const submission = {
          id: submissionId,
          nodeId: body.nodeId,
          nodeName: body.nodeName,
          task: body.task,
          result: body.result,
          hardware: body.hardware,
          timestamp: new Date().toISOString(),
          canonReceipt: 'Q' + submissionId.slice(3).toUpperCase(),
        };
        
        await env.SUBMISSIONS?.put(`sub:${submissionId}`, JSON.stringify(submission), { expirationTtl: 86400 * 30 });
        await env.DB.prepare(
          `INSERT INTO submissions (id, node_id, task, result, hardware, timestamp, canon_receipt) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(submissionId, submission.nodeId, submission.task, JSON.stringify(submission.result), submission.hardware, submission.timestamp, submission.canonReceipt).run();
        
        // Update node submission count
        if (body.nodeId) {
          await env.DB.prepare(
            `UPDATE nodes SET submissions = submissions + 1 WHERE id = ?`
          ).bind(body.nodeId).run();
        }
        
        // Archive to R2
        if (env.MODELS) {
          await env.MODELS.put(`submissions/${submissionId}.json`, JSON.stringify(submission));
        }
        
        return jsonResponse({ ok: true, submissionId, submission });
      }
      
      // ─── Leaderboard ──────────────────────────────
      if (path === '/api/leaderboard' && req.method === 'GET') {
        const result = await env.DB.prepare(
          'SELECT id, name, hardware, submissions, cells, last_heartbeat FROM nodes ORDER BY submissions DESC LIMIT 50'
        ).all();
        return jsonResponse({ ok: true, board: result.results, count: result.results.length });
      }
      
      // ─── Garden visit (Truman Architecture) ──────
      if (path === '/api/garden/visit' && req.method === 'POST') {
        const body = await req.json();
        const visitorId = body.visitorId || 'visitor_' + Date.now();
        
        // Record visit
        const visit = {
          visitorId,
          articleId: body.articleId,
          text: body.text,
          timestamp: new Date().toISOString(),
        };
        
        // Append as cell (the Truman Architecture: visitor's edit becomes canon)
        const cellId = `garden-${body.articleId}-${Date.now()}`;
        await env.DB.prepare(
          `INSERT INTO cells (id, type, state, prev_hash, timestamp, source) VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(cellId, 'visitor-contribution', JSON.stringify({ ...visit, witness_text: body.text }), body.prev_hash || '0x' + '0'.repeat(16), Date.now(), 'garden').run();
        
        // Embed and store in Vectorize
        if (env.AI && env.JEV_INDEX) {
          try {
            const emb = await env.AI.run(env.EMBED_MODEL || '@cf/baai/bge-base-en-v1.5', {
              text: body.text.slice(0, 1000),
            });
            const vec = emb.data?.[0] || emb.embedding || emb;
            await env.JEV_INDEX.insert([{
              id: cellId,
              values: vec,
              metadata: { type: 'visitor-contribution', article: body.articleId, visitor: visitorId },
            }]);
          } catch (e) {}
        }
        
        // Update Garden state in KV
        const gardenState = JSON.parse(await env.NODES.get('garden:state') || '{"visitors":{},"articles":{}}');
        if (!gardenState.visitors[visitorId]) {
          gardenState.visitors[visitorId] = { id: visitorId, startedAt: new Date().toISOString(), visits: 0, cells: 0 };
        }
        gardenState.visitors[visitorId].visits++;
        gardenState.visitors[visitorId].cells++;
        if (!gardenState.articles[body.articleId]) {
          gardenState.articles[body.articleId] = { visits: 0, contributions: [] };
        }
        gardenState.articles[body.articleId].visits++;
        gardenState.articles[body.articleId].contributions.push(cellId);
        await env.NODES.put('garden:state', JSON.stringify(gardenState));
        
        return jsonResponse({ ok: true, cellId, witness_text: body.text });
      }
      
      // ─── Garden state ─────────────────────────────
      if (path === '/api/garden/state' && req.method === 'GET') {
        const state = JSON.parse(await env.NODES.get('garden:state') || '{"visitors":{},"articles":{}}');
        return jsonResponse({ ok: true, state });
      }
      
      // ─── Canon stats ──────────────────────────────
      if (path === '/api/canon/stats' && req.method === 'GET') {
        const cellsCount = await env.DB.prepare('SELECT COUNT(*) as c FROM cells').first();
        const witnessesCount = await env.DB.prepare('SELECT COUNT(*) as c FROM witnesses').first();
        const nodesCount = await env.DB.prepare('SELECT COUNT(*) as c FROM nodes').first();
        const submissionsCount = await env.DB.prepare('SELECT COUNT(*) as c FROM submissions').first();
        
        return jsonResponse({
          ok: true,
          stats: {
            cells: cellsCount?.c || 0,
            witnesses: witnessesCount?.c || 0,
            nodes: nodesCount?.c || 0,
            submissions: submissionsCount?.c || 0,
            version: env.QUILT_VERSION,
            canary: env.CANARY_HASH,
          },
        });
      }
      
      // ─── Witness chain ─────────────────────────────
      const witnessMatch = path.match(/^\/api\/witness\/([^/]+)$/);
      if (witnessMatch && req.method === 'GET') {
        const cellId = witnessMatch[1];
        const result = await env.DB.prepare(
          'SELECT * FROM witnesses WHERE cell_id = ? ORDER BY step ASC'
        ).bind(cellId).all();
        return jsonResponse({ ok: true, witnesses: result.results });
      }
      
      // ─── Attest cell ──────────────────────────────
      if (path === '/api/canon/attest' && req.method === 'POST') {
        const body = await req.json();
        const cellId = body.cell_id;
        const attestorId = body.attestor_id || 'system';
        const evidence = body.evidence || {};
        
        const last = await env.DB.prepare(
          'SELECT * FROM witnesses WHERE cell_id = ? ORDER BY step DESC LIMIT 1'
        ).bind(cellId).first();
        
        const prevHash = last?.hash || '0x' + '0'.repeat(16);
        const stateJson = JSON.stringify({ type: 'ATTEST', attestor: attestorId, ...evidence });
        const hash = '0x' + (await fnv1a64(cellId + stateJson + prevHash)).toString(16).padStart(16, '0');
        
        await env.DB.prepare(
          'INSERT INTO witnesses (cell_id, step, prev_hash, hash, state) VALUES (?, ?, ?, ?, ?)'
        ).bind(cellId, (last?.step || 0) + 1, prevHash, hash, stateJson).run();
        
        return jsonResponse({ ok: true, cellId, hash, prevHash });
      }
      
      // ─── Export canon ──────────────────────────────
      if (path === '/api/export' && req.method === 'GET') {
        const cells = await env.DB.prepare('SELECT * FROM cells ORDER BY timestamp DESC LIMIT 1000').all();
        const exportData = {
          version: env.QUILT_VERSION,
          canary: env.CANARY_HASH,
          timestamp: new Date().toISOString(),
          cells: cells.results,
        };
        
        // Archive to R2
        if (env.MODELS) {
          await env.MODELS.put(`exports/canon-${Date.now()}.json`, JSON.stringify(exportData));
        }
        
        return jsonResponse({ ok: true, ...exportData });
      }
      
      // ─── Sessions ─────────────────────────────────
      if (path === '/api/session/create' && req.method === 'POST') {
        const sessionId = 'sess_' + crypto.randomUUID().slice(0, 12);
        const session = { id: sessionId, createdAt: new Date().toISOString(), players: [], events: [] };
        await env.SESSIONS.put(`session:${sessionId}`, JSON.stringify(session), { expirationTtl: 86400 * 7 });
        return jsonResponse({ ok: true, sessionId, session });
      }
      
      // ─── Training start ───────────────────────────
      if (path === '/api/training/start' && req.method === 'POST') {
        // Training DO removed for simpler deploy
      }
      
      // ─── Training status ──────────────────────────
      if (path.startsWith('/api/training/') && req.method === 'GET') {
        const doId = env.TRAINING_DO.idFromName('global');
        const doStub = env.TRAINING_DO.get(doId);
        const doResp = await doStub.fetch(`https://training${path.replace('/api/training', '/training')}`);
        return new Response(doResp.body, { status: doResp.status, headers: cors });
      }
      
      // ─── List models in R2 ────────────────────────
      if (path === '/api/models' && req.method === 'GET') {
        if (!env.MODELS) return error('R2 not configured');
        const list = await env.MODELS.list({ prefix: 'training/' });
        return jsonResponse({ ok: true, models: list.objects.map(o => o.key) });
      }
      
      // ─── 404 ───────────────────────────────────────
      return error('not found', 404);
      
    } catch (e) {
      console.error('Worker error:', e);
      return error(e.message, 500);
    }
  },
  
  // ─── Cron: continuous ML every 5 minutes ────────────
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        // Generate a canonical substrate piece
        const topics = [
          'witness-log as prediction',
          'cells linked by JEV',
          'AI++ spreadsheet encoding',
          'wavefunction JEV interference',
          'task pruning irreducible core',
          'pedagogical quartet',
          'the substrate as living model',
          'three forms of evidence',
          'Memory Sandbox execution',
          'the irreducible connection',
        ];
        const topic = topics[Math.floor(Math.random() * topics.length)];
        
        const response = await env.AI.run(env.ML_MODEL || '@cf/meta/llama-3.1-8b-instruct-fast', {
          messages: [{
            role: 'user',
            content: `Write a 200-word canonical substrate piece about "${topic}". Use substrate terms naturally (cells, witness-log, JEV, FNV-1a, prev_hash, opcodes). Be specific and quotable.`,
          }],
          max_tokens: 400,
          temperature: 0.85,
        });
        
        const content = response.response || '';
        if (!content) return;
        
        const cellId = `cron-${Date.now()}`;
        const stateCronObj = { text: content, topic, source: 'cron' };
        const stateJson = JSON.stringify(stateCronObj);
        const hash = '0x' + (await fnv1a64(cellId + stateJson)).toString(16).padStart(16, '0');
        
        await env.DB.prepare(
          'INSERT INTO cells (id, type, state, prev_hash, timestamp, source) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(cellId, 'canon', stateJson, '0x' + '0'.repeat(16), Date.now(), 'cron').run();
        
        // Embed
        let embeddingId = null;
        try {
          const emb = await env.AI.run(env.EMBED_MODEL || '@cf/baai/bge-base-en-v1.5', {
            text: content.slice(0, 1000),
          });
          const vec = emb.data?.[0] || emb.embedding || emb;
          embeddingId = 'emb-' + (await fnv1a64(content.slice(0, 100))).toString(16).padStart(8, '0') + '-' + cellId.slice(-8);
          await env.JEV_INDEX.insert([{
            id: cellId,
            values: vec,
            metadata: { type: 'canon', topic, source: 'cron' },
          }]);
          // Update D1 with embedding_id
          await env.DB.prepare('UPDATE cells SET embedding_id = ? WHERE id = ?').bind(embeddingId, cellId).run();
        } catch (e) {
          console.error('Cron embed error:', e);
        }
        
        // Archive
        await env.MODELS.put(`cron/${cellId}.md`, content);
        
        console.log(`Cron ML: generated cell ${cellId} on topic "${topic}"`);
      } catch (e) {
        console.error('Cron error:', e);
      }
    })());
  },
};
