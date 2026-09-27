// Cargo Line Tycoon — the Chart (Pencil Sea renderer)
//
// Replaces the Phase 1 map+panels UI with the one screen and one verb from
// FABLE-CARGO-LINE-ANSWER.md §3 (the Chart) and §5 (Pencil Sea). Browser-only
// (not dual-mode): this file wires window.CLTEngine to the DOM. It never
// makes gameplay decisions itself — every action goes through GameEngine
// methods (buyShip/assignShip/unassignShip/previewStake/tick), so what you
// see here is exactly what game/test/*.js exercises headlessly.
//
// The one interaction (§3.3): tap a ship -> tap a port -> a stake note
// appears in the margin -> confirm (tap the note, or tap the port again).
// Recall = tap a sailing ship, tap "recall". Tap the sheet to pause/resume.
// The shipyard seal buys a ship. There is no start screen; "new chart" is
// one small margin affordance.
(function () {
  'use strict';

  const { GameEngine, SHIP_CLASSES, PORTS, PORTS_BY_ID, STARTING_CASH, HOME_PORT_ID, CHOKEPOINTS } = window.CLTEngine;

  // ── the Tell's first telemetry instrument (Fable §7.3/§8): two numbers on
  // window, pencil vs ink stakes placed this session. ─────────────────────
  window.pencilStakesPlaced = 0;
  window.inkStakesPlaced = 0;

  // ── sound-shape — a desk, not a soundtrack (Fable §5.3) ─────────────────
  // Short, inline-data WAV clips synthesized once at load (pure decoration —
  // never read by game logic, so Math.random() here doesn't touch replay
  // determinism). Everything <=400ms except the pen-trace (900ms).
  const SR = 8000;
  function wavDataUri(samples) {
    const buf = new ArrayBuffer(44 + samples.length * 2);
    const v = new DataView(buf);
    function str(off, s) { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, samples.length * 2, true);
    let off = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
    let bin = ''; const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return 'data:audio/wav;base64,' + btoa(bin);
  }
  function tone(freq, dur, decay) {
    const n = Math.round(SR * dur); const out = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / SR; out[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * decay); }
    return out;
  }
  function noise(dur, decay) {
    const n = Math.round(SR * dur); const out = new Float32Array(n);
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      prev = prev * 0.7 + (Math.random() * 2 - 1) * 0.3; // softened noise, not pure hiss
      out[i] = prev * (decay ? Math.exp(-t * decay) : 1);
    }
    return out;
  }
  const SOUND_URIS = {
    stamp1: wavDataUri(tone(880, 0.09, 26)),
    stamp2: wavDataUri(tone(740, 0.09, 26)),
    stamp3: wavDataUri(tone(660, 0.09, 26)),
    scratch: wavDataUri(noise(0.15, 9)),
    penTrace: wavDataUri(noise(0.9, 1.6)),
    rubber: wavDataUri(noise(0.4, 5)),
    plup: wavDataUri(tone(150, 0.16, 18)),
    typewriter: wavDataUri(noise(0.035, 30)),
    bell: (function () {
      const n = Math.round(SR * 0.55); const out = new Float32Array(n);
      for (let i = 0; i < n; i++) { const t = i / SR; out[i] = (Math.sin(2 * Math.PI * 1180 * t) * 0.7 + Math.sin(2 * Math.PI * 1770 * t) * 0.3) * Math.exp(-t * 5); }
      return wavDataUri(out);
    })(),
  };
  const AUDIO_CACHE = {};
  let muted = false;
  try { muted = localStorage.getItem('clt_muted') === '1'; } catch (e) { /* private mode / blocked storage: default unmuted */ }
  function playSound(name) {
    if (muted) return;
    try {
      if (!AUDIO_CACHE[name]) AUDIO_CACHE[name] = new Audio(SOUND_URIS[name]);
      const a = AUDIO_CACHE[name].cloneNode();
      a.volume = 0.55;
      a.play().catch(() => {});
    } catch (e) { /* autoplay policy or unsupported — silently no-op, never breaks the game */ }
  }
  function playStamp() { playSound(['stamp1', 'stamp2', 'stamp3'][Math.floor(Math.random() * 3)]); }

  // ── projection: lat/lng -> a clean schematic, not literal cartography ──
  const LNG_MIN = -132, LNG_MAX = 108, LAT_MIN = -4, LAT_MAX = 58;
  const MAP_W = 1180, MAP_H = 560, PAD = 55;
  function project(lat, lng) {
    const x = PAD + ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * (MAP_W - 2 * PAD);
    const y = PAD + ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * (MAP_H - 2 * PAD);
    return { x, y };
  }

  const REAL_XY = {};
  for (const p of PORTS) REAL_XY[p.id] = project(p.lat, p.lng);
  REAL_XY.long_beach.x += 14; REAL_XY.long_beach.y += 12; // San Pedro Bay label-collision nudge (cosmetic only)

  const MAP_LABELS = { new_york: 'New York' };
  function shortName(port) { return port.name.replace(/^Port of /, '').replace('PortMiami', 'Miami'); }
  function mapLabel(port) { return MAP_LABELS[port.id] || shortName(port); }

  function centroid(ids) {
    let x = 0, y = 0; for (const id of ids) { x += REAL_XY[id].x; y += REAL_XY[id].y; }
    return { x: x / ids.length, y: y / ids.length };
  }
  const WEST_C = centroid(window.CLT_PORTS.WEST_COAST);
  const EAST_C = centroid(window.CLT_PORTS.EAST_GULF_COAST);
  const PANAMA_XY = { x: (WEST_C.x + EAST_C.x) / 2, y: Math.max(WEST_C.y, EAST_C.y) + 65 };
  const CHOKE_XY = {};
  for (const id of Object.keys(CHOKEPOINTS)) { if (id !== 'panama') CHOKE_XY[id] = project(CHOKEPOINTS[id].lat, CHOKEPOINTS[id].lng); }
  function chokeXY(id) { return id === 'panama' ? PANAMA_XY : CHOKE_XY[id]; }
  function shortChokeName(id) { return { suez: 'Suez', bab_el_mandeb: 'Bab-el-Mandeb', hormuz: 'Hormuz', malacca: 'Malacca', gibraltar: 'Gibraltar', panama: 'Panama' }[id] || id; }

  function fmtMoney(n) { return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString(); }
  function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function isPencilPort(portId, state) {
    const pp = state.pencilPorts[portId];
    return !!pp && pp.provenance.source === 'procgen';
  }
  function seedPhase(label) {
    let h = 0; for (let i = 0; i < String(label).length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
    return (h % 7000) / 1000; // 0..7s — a stable phase inside the 7s breathing cycle
  }

  function waypointsForLeg(originId, destId, chokepointIds, xyOf) {
    const pts = [xyOf(originId)];
    for (const cpId of (chokepointIds || [])) pts.push(chokeXY(cpId));
    pts.push(xyOf(destId));
    return pts;
  }
  function pointAlongPath(pts, frac) {
    const segs = pts.length - 1; if (segs <= 0) return pts[0];
    const t = Math.max(0, Math.min(1, frac)) * segs;
    const i = Math.min(segs - 1, Math.floor(t)); const lf = t - i;
    const a = pts[i], b = pts[i + 1];
    return { x: a.x + (b.x - a.x) * lf, y: a.y + (b.y - a.y) * lf };
  }

  // ── game + UI state ──────────────────────────────────────────────────
  let game = null;
  let autoplayTimer = null;
  let lastWitnessLen = 0;
  let firstScarShown = false;
  let selectedShipId = null;
  let pendingStake = null; // { shipId, portId }
  let cashDisplayed = 0;
  let cashTweenRaf = null;
  let introDone = false;

  function svgEl(tag) { return document.createElementNS('http://www.w3.org/2000/svg', tag); }

  function allPortXY(state) {
    const xy = { ...REAL_XY };
    for (const id of Object.keys(state.pencilPorts)) {
      const pp = state.pencilPorts[id];
      xy[id] = project(pp.lat, pp.lng);
    }
    return xy;
  }

  // ── the fx layer: transient one-shot effects, decoupled from the 700ms
  // re-render cadence so a 900ms pen-trace or a 700ms smear is never cut
  // short by the next tick's redraw (Fable §5.2). ────────────────────────
  function fxLayer() { return document.getElementById('fx-layer'); }
  function fxPulse(cx, cy, cls, ms) {
    const c = svgEl('circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', 3);
    c.setAttribute('class', cls);
    fxLayer().appendChild(c);
    setTimeout(() => c.remove(), ms);
  }
  function fxText(cx, cy, text, cls, ms) {
    const t = svgEl('text');
    t.setAttribute('x', cx); t.setAttribute('y', cy); t.setAttribute('class', cls);
    t.textContent = text;
    fxLayer().appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  // ── witness-log diff -> landings/animations/sound (Fable §3.4) ─────────
  function processNewWitnessEntries(xyOf) {
    const log = game.world.witness_log;
    for (let i = lastWitnessLen; i < log.length; i++) {
      const e = log[i];
      if (e.type === 'fact_landed') handleFactLanded(e, xyOf);
      else if (e.type === 'ship_arrived') handleShipArrived(e);
    }
    lastWitnessLen = log.length;
  }

  function handleFactLanded(e, xyOf) {
    if (e.cell_type !== 'port') return;
    const portId = e.entity_id.replace(/^port:/, '');
    const xy = xyOf(portId);
    if (!xy) return;
    if (e.verdict === 'proven') {
      playSound('penTrace');
      setTimeout(playStamp, 880);
      const c = svgEl('circle');
      c.setAttribute('cx', xy.x); c.setAttribute('cy', xy.y); c.setAttribute('r', 9);
      c.setAttribute('class', 'fx-pen-trace-ring');
      fxLayer().appendChild(c);
      setTimeout(() => { c.classList.add('anim-seal-thump'); }, 900);
      setTimeout(() => c.remove(), 1300);
    } else if (e.verdict === 'erased') {
      playSound('rubber');
      fxPulse(xy.x, xy.y, 'fx-smear anim-smear', 750);
      if (!firstScarShown) { firstScarShown = true; }
    } else if (e.verdict === 'revised') {
      playStamp();
      const c = svgEl('circle');
      c.setAttribute('cx', xy.x); c.setAttribute('cy', xy.y); c.setAttribute('r', 10);
      c.setAttribute('class', 'fx-restamp anim-seal-thump');
      fxLayer().appendChild(c);
      setTimeout(() => c.remove(), 400);
    }
  }

  function handleShipArrived(e) {
    playSound('plup');
    playSound('bell');
    const state = game.getState();
    document.getElementById('chart-pane').classList.add('anim-paper-shake');
    setTimeout(() => document.getElementById('chart-pane').classList.remove('anim-paper-shake'), 200);
  }

  // ── cash tween ───────────────────────────────────────────────────────
  function tweenCash(to) {
    const from = cashDisplayed;
    if (from === to) { document.getElementById('cash-value').textContent = fmtMoney(to); return; }
    const start = performance.now(); const dur = 400;
    if (cashTweenRaf) cancelAnimationFrame(cashTweenRaf);
    const deltaEl = document.getElementById('cash-delta-el');
    deltaEl.textContent = (to > from ? '+' : '') + fmtMoney(to - from);
    deltaEl.className = 'cash-delta ' + (to > from ? 'up' : 'down');
    function step(now) {
      const f = Math.min(1, (now - start) / dur);
      const v = from + (to - from) * f;
      document.getElementById('cash-value').textContent = fmtMoney(v);
      if (f < 1) { cashTweenRaf = requestAnimationFrame(step); } else { cashDisplayed = to; setTimeout(() => { deltaEl.textContent = ''; }, 900); }
    }
    cashTweenRaf = requestAnimationFrame(step);
  }

  // ── rendering: static layers (paper/graticule/seals/pencil/ghosts/lanes/
  // chokepoints), fully redrawn every tick — cheap, and nothing here is
  // mid-transition (see ship layer below for the one thing that IS). ─────
  // Layer order per Fable §3.2/the build spec, exactly: paper/graticule ->
  // ink coast (skipped — no coastline is booked as canon, so none is drawn,
  // §6's "no unmarked marks") -> ink seals -> pencil ports -> ghosts ->
  // chinagraph lanes -> ships (a separate persistent layer, see
  // renderShips) -> chokepoint weather hatching. Ink is drawn BEFORE pencil
  // so an unproven pencil mark — the thing the player is most likely to
  // want to tap, especially where a jittered pencil port sits close to a
  // real one (Port Hueneme sits only a few pixels from LA at this
  // projection's scale) — is always the topmost, clickable layer.
  function renderStatic(state, xyOf) {
    let under = '';
    for (let gx = PAD; gx <= MAP_W - PAD; gx += 90) under += `<line class="graticule" x1="${gx}" y1="${PAD}" x2="${gx}" y2="${MAP_H - PAD}"></line>`;
    for (let gy = PAD; gy <= MAP_H - PAD; gy += 70) under += `<line class="graticule" x1="${PAD}" y1="${gy}" x2="${MAP_W - PAD}" y2="${gy}"></line>`;

    // ink seals: real canon ports + proven-pencil ports, both are just
    // "port cells whose provenance is canon" — no separate code path.
    const inkIds = [...Object.keys(PORTS_BY_ID)];
    for (const id of Object.keys(state.pencilPorts)) { if (!state.pencilPorts[id].erased && state.pencilPorts[id].provenance.source === 'canon') inkIds.push(id); }
    for (const id of inkIds) {
      const isReal = !!PORTS_BY_ID[id];
      const meta = isReal ? PORTS_BY_ID[id] : state.pencilPorts[id];
      const xy = xyOf(id);
      const isHome = id === HOME_PORT_ID;
      const r = isReal && meta.tier === 1 ? 7 : 6;
      const trust = meta.provenance.trust;
      const ringOpacity = Math.max(0.35, Math.min(1, trust));
      const reachable = selectedShipId && !pendingStake;
      const shipyard = isHome ? `<circle class="shipyard-seal${state.company.cash >= Object.values(SHIP_CLASSES)[0].purchaseCost ? ' affordable' : ''}" data-shipyard="1" cx="${xy.x}" cy="${xy.y + r + 9}" r="4" fill="var(--gold)"></circle>` : '';
      under += `<g class="ink-seal${reachable ? ' reachable' : ''}" data-port="${id}">
        ${isHome ? `<circle class="seal-home-ring" cx="${xy.x}" cy="${xy.y}" r="${r + 5}"></circle>` : ''}
        <circle class="seal-ring" cx="${xy.x}" cy="${xy.y}" r="${r + 3}" stroke-width="1.4" opacity="${ringOpacity.toFixed(2)}"></circle>
        <circle class="seal-dot" cx="${xy.x}" cy="${xy.y}" r="${r}"></circle>
        <text class="seal-label chart-name" x="${xy.x + r + 5}" y="${xy.y + 4}">${escapeHtml(isReal ? mapLabel(meta) : meta.name)}</text>
        ${shipyard}
      </g>`;
    }

    // pencil ports (unproven only — proven ones render as ink seals above,
    // drawn UNDER this layer). Reachable/clickable on top of ink.
    for (const id of Object.keys(state.pencilPorts)) {
      const pp = state.pencilPorts[id];
      if (pp.erased || pp.provenance.source !== 'procgen') continue;
      const xy = xyOf(id);
      const trust = pp.provenance.trust;
      const amp = (0.6 * (1 - trust)).toFixed(2);
      const phase = seedPhase(pp.breatheSeed);
      const reachable = selectedShipId && !pendingStake;
      under += `<g class="pencil-port${reachable ? ' reachable' : ''}" data-port="${id}" style="animation:breathe 7s ease-in-out infinite;animation-delay:-${phase}s;--breathe-amp:-${amp}px;">
        <circle cx="${xy.x}" cy="${xy.y}" r="5" stroke="color-mix(in srgb, var(--pencil-1) ${Math.round(trust * 100)}%, var(--pencil-0))" stroke-width="1.3"></circle>
        <text class="pencil-label" x="${xy.x + 8}" y="${xy.y + 4}" fill="color-mix(in srgb, var(--pencil-1) ${Math.round(trust * 100)}%, var(--pencil-0))">${escapeHtml(pp.name)}</text>
      </g>`;
    }

    // ghosts (erased pencil ports) — a G12 tombstone, drawn faint with a strike
    for (const id of Object.keys(state.pencilPorts)) {
      const pp = state.pencilPorts[id];
      if (!pp.erased) continue;
      const xy = xyOf(id);
      under += `<g class="ghost-port"><circle cx="${xy.x}" cy="${xy.y}" r="5" fill="none" stroke="var(--ghost)"></circle>
        <line class="ghost-strike" x1="${xy.x - 6}" y1="${xy.y - 6}" x2="${xy.x + 6}" y2="${xy.y + 6}"></line>
        <text class="pencil-label" x="${xy.x + 8}" y="${xy.y + 4}" fill="var(--ghost)">${escapeHtml(pp.name)}</text></g>`;
    }

    // routes / chinagraph lanes
    for (const route of state.routes) {
      const shipId = route.assignedShipIds && route.assignedShipIds[0];
      const ship = shipId && state.ships.find((s) => s.id === shipId);
      const preview = ship ? game.previewRoute(route.fromPortId, route.toPortId, ship.classId) : null;
      const chokepointsUsed = preview && preview.ok ? preview.chokepointsUsed : [];
      const pts = waypointsForLeg(route.fromPortId, route.toPortId, chokepointsUsed, xyOf);
      const dashed = isPencilPort(route.fromPortId, state) || isPencilPort(route.toPortId, state);
      const d = `M ${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')}`;
      under += `<path class="chinagraph-lane${dashed ? ' dashed' : ''}" data-route="${route.id}" d="${d}"></path>`;
    }
    if (pendingStake) {
      const ship = state.ships.find((s) => s.id === pendingStake.shipId);
      if (ship) {
        const pts = [xyOf(ship.positionPortId), xyOf(pendingStake.portId)];
        const d = `M ${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')}`;
        under += `<path class="chinagraph-lane preview" d="${d}"></path>`;
      }
    }

    document.getElementById('static-under').innerHTML = under;

    // chokepoint weather hatching — the LAST layer, above ships too (the
    // build spec's own stated order); sparse/dashed enough not to obscure
    // what's underneath.
    let over = '';
    for (const id of Object.keys(CHOKEPOINTS)) {
      const xy = chokeXY(id);
      let status, medium;
      if (id === 'panama') { status = state.panama.disrupted ? 'disrupted' : 'open'; medium = 'pencil'; }
      else { const c = state.chokepoints[id]; status = c.status; medium = c.current.isSimulated ? 'pencil' : 'ink'; }
      if (status === 'open') continue;
      const n = status === 'disrupted' ? 5 : 3;
      let hatch = '';
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 5;
        hatch += `<line class="choke-hatch medium-${medium}" x1="${xy.x - 7 + off}" y1="${xy.y + 8}" x2="${xy.x + 7 + off}" y2="${xy.y - 8}"></line>`;
      }
      over += `<g style="pointer-events:none;">${hatch}<text class="choke-label" x="${xy.x}" y="${xy.y + 20}" text-anchor="middle">${escapeHtml(shortChokeName(id))} · ${escapeHtml(status)}</text></g>`;
    }
    document.getElementById('static-over').innerHTML = over;

    document.querySelectorAll('#static-under [data-port]').forEach((el) => el.addEventListener('click', (ev) => { ev.stopPropagation(); onPortClick(el.getAttribute('data-port')); }));
    document.querySelectorAll('#static-under [data-shipyard]').forEach((el) => el.addEventListener('click', (ev) => { ev.stopPropagation(); onShipyardClick(); }));
  }

  // ── ship layer: persistent circles updated in place so CSS `transition:
  // cx, cy` actually interpolates between ticks (Fable §5.2 "ships
  // interpolate between ticks so they slide, never jump"). ───────────────
  function renderShips(state, xyOf) {
    const layer = document.getElementById('ship-layer');
    const seen = new Set();
    for (const ship of state.ships) {
      seen.add(ship.id);
      let pos;
      if (ship.transit) {
        const t = ship.transit;
        const originId = t.leg === 'outbound' ? t.routeFrom : t.routeTo;
        const destId = t.leg === 'outbound' ? t.routeTo : t.routeFrom;
        const frac = t.legTotalTicks ? 1 - t.ticksRemaining / t.legTotalTicks : 0;
        const pts = waypointsForLeg(originId, destId, t.chokepointsUsed, xyOf);
        pos = pointAlongPath(pts, frac);
      } else {
        pos = xyOf(ship.positionPortId);
      }
      if (!pos) continue;
      let el = layer.querySelector(`[data-ship="${ship.id}"]`);
      if (!el) {
        el = svgEl('circle');
        el.setAttribute('data-ship', ship.id);
        el.setAttribute('r', 4.5);
        el.setAttribute('cx', pos.x); el.setAttribute('cy', pos.y); // no transition on first paint
        layer.appendChild(el);
      }
      el.setAttribute('class', 'ship-dot' + (ship.id === selectedShipId ? ' selected' : ''));
      el.setAttribute('cx', pos.x);
      el.setAttribute('cy', pos.y);
      el.onclick = (ev) => { ev.stopPropagation(); onShipClick(ship); };
    }
    layer.querySelectorAll('[data-ship]').forEach((el) => { if (!seen.has(el.getAttribute('data-ship'))) el.remove(); });
  }

  // ── the two clocks + cash head + log + tell line ────────────────────────
  function renderChrome(state) {
    // the truth horizon: the most-recent as_of among all canon/proven cells
    let latestAsOf = null;
    for (const id of Object.keys(PORTS_BY_ID)) { const p = PORTS_BY_ID[id]; if (!latestAsOf || p.provenance.as_of > latestAsOf) latestAsOf = p.provenance.as_of; }
    for (const id of Object.keys(state.pencilPorts)) { const pp = state.pencilPorts[id]; if (pp.provenance.source === 'canon' && pp.provenance.as_of && (!latestAsOf || pp.provenance.as_of > latestAsOf)) latestAsOf = pp.provenance.as_of; }
    document.getElementById('clock-asof-text').textContent = `CHART AS OF ${latestAsOf || '—'}`;
    document.getElementById('clock-day-text').textContent = `day ${state.tick}`;
    document.getElementById('tick-num').textContent = state.tick;

    tweenCash(state.company.cash);

    const logEl = document.getElementById('log');
    logEl.innerHTML = state.log.slice(-60).map((e) => {
      const cls = /🏆/.test(e.msg) ? 'achievement' : (/SCOUT ·/.test(e.msg) ? 'scout' : (/ghost —/.test(e.msg) ? 'ghost' : ''));
      return `<div class="entry ${cls}"><span class="t">d${e.tick}</span>${escapeHtml(e.msg)}</div>`;
    }).join('');

    document.getElementById('tell-line').textContent =
      `pencil stakes ${window.pencilStakesPlaced} · ink stakes ${window.inkStakesPlaced} — the pencil is where the money is.`;
  }

  // ── stake note / buy note ───────────────────────────────────────────────
  function medium(meta) { return meta.isPencil ? 'pencil' : 'ink'; }

  function showStakeNote(shipId, portId) {
    const preview = game.previewStake(shipId, portId);
    const note = document.getElementById('stake-note');
    if (!preview.ok) {
      note.className = 'show';
      note.innerHTML = `<div>${escapeHtml(preview.reason)}</div><button data-cancel="1">Cancel</button>`;
      note.querySelector('[data-cancel]').addEventListener('click', clearSelection);
      pendingStake = null;
      return;
    }
    pendingStake = { shipId, portId };
    const portName = game._portName ? game._portName(portId) : portId;
    const via = preview.via.length ? ` · via ${preview.via.map((v) => `${shortChokeName(v.id)} (${v.medium})`).join(' + ')}` : '';
    const rangeHtml = preview.unproven
      ? `<span class="medium-pencil">pencil, trust ${Math.round((game.world.entities.get(`port:${portId}`).state.provenance.trust) * 100)}%</span> · <span class="range">${fmtMoney(preview.low)} – ${fmtMoney(preview.high)}</span> · unproven — if it isn't there you land at the nearest ink`
      : `<span class="medium-ink">ink</span> · <span class="range">${fmtMoney(preview.low)}</span>`;
    note.className = 'show';
    note.innerHTML = `<div>stake · ${escapeHtml(shipId)} · ${escapeHtml(portName)} · ${preview.days} d${via}</div>
      <div style="margin-top:0.3em;">${rangeHtml}</div>
      <button class="primary" data-confirm="1">Confirm</button><button data-cancel="1">Cancel</button>`;
    note.querySelector('[data-confirm]').addEventListener('click', confirmStake);
    note.querySelector('[data-cancel]').addEventListener('click', clearSelection);
  }

  function confirmStake() {
    if (!pendingStake) return;
    const ship = game.world.entities.get(pendingStake.shipId).state;
    const r = game.assignShip(pendingStake.shipId, ship.positionPortId, pendingStake.portId);
    if (r.ok) {
      if (r.medium === 'pencil') window.pencilStakesPlaced++; else window.inkStakesPlaced++;
      playSound('scratch');
    }
    clearSelection();
    refresh();
  }

  function clearSelection() {
    selectedShipId = null; pendingStake = null;
    document.getElementById('stake-note').className = '';
    document.getElementById('stake-note').innerHTML = '';
    refresh();
  }

  function onShipClick(ship) {
    if (ship.transit) {
      const note = document.getElementById('stake-note');
      note.className = 'show';
      note.innerHTML = `<div>${escapeHtml(ship.id)} — under way. Recall to pull it home?</div><button data-recall="1">Recall</button><button data-cancel="1">Never mind</button>`;
      note.querySelector('[data-recall]').addEventListener('click', () => { game.unassignShip(ship.id); clearSelection(); });
      note.querySelector('[data-cancel]').addEventListener('click', clearSelection);
      return;
    }
    selectedShipId = ship.id;
    pendingStake = null;
    document.getElementById('stake-note').className = '';
    refresh();
  }

  function onPortClick(portId) {
    document.getElementById('buy-note').className = '';
    if (pendingStake && pendingStake.portId === portId) { confirmStake(); return; }
    if (!selectedShipId) return;
    showStakeNote(selectedShipId, portId);
  }

  function onShipyardClick() {
    if (selectedShipId) return; // a ship is already selected — tap a port, not the shipyard
    const note = document.getElementById('buy-note');
    note.className = 'show';
    const state = game.getState();
    note.innerHTML = `<div class="chart-name" style="font-size:0.85em;letter-spacing:0.04em;color:var(--pencil-1);text-transform:uppercase;margin-bottom:0.3em;">Shipyard</div>` +
      Object.values(SHIP_CLASSES).map((cls) => `
        <div class="buy-row">
          <span><span class="cls-name">${escapeHtml(cls.name)}</span><span class="cls-meta">${cls.capacityTeu.toLocaleString()} TEU · ${fmtMoney(cls.purchaseCost)}</span></span>
          <button data-buy="${cls.id}" ${state.company.cash < cls.purchaseCost ? 'disabled' : ''}>Buy</button>
        </div>`).join('');
    note.querySelectorAll('[data-buy]').forEach((btn) => btn.addEventListener('click', () => {
      const r = game.buyShip(btn.getAttribute('data-buy'));
      if (r.ok) playStamp();
      note.className = '';
      refresh();
    }));
  }

  // ── autoplay ─────────────────────────────────────────────────────────
  function tickOnce() {
    const xyOfBefore = allPortXY(game.getState());
    game.tick();
    const xyOfAfter = allPortXY(game.getState());
    processNewWitnessEntries((id) => xyOfAfter[id] || xyOfBefore[id]);
    refresh();
  }
  function startAutoplay() { if (!autoplayTimer) autoplayTimer = setInterval(tickOnce, 700); }
  function stopAutoplay() { if (autoplayTimer) { clearInterval(autoplayTimer); autoplayTimer = null; } }
  function isPaused() { return !autoplayTimer; }

  // ── refresh: redraw everything from current state ───────────────────
  function refresh() {
    const state = game.getState();
    const xyOf = allPortXY(state);
    renderStatic(state, (id) => xyOf[id]);
    renderShips(state, (id) => xyOf[id]);
    renderChrome(state);
  }

  // ── the first sixty seconds (Fable §4) — a scripted intro, no start
  // screen, no seed box. Purely presentational timing; game ticks (and
  // therefore the reveal schedule) run independently via startAutoplay(),
  // which is why an early fact_landed can land "on its own" while this
  // intro is still playing. ────────────────────────────────────────────
  function playIntro(state) {
    document.getElementById('chart-pane').classList.add('intro-fade');
    setTimeout(() => document.getElementById('chart-pane').classList.remove('intro-fade'), 320);
    playSound('scratch');

    const westToEast = [...Object.keys(PORTS_BY_ID)].sort((a, b) => PORTS_BY_ID[a].lng - PORTS_BY_ID[b].lng);
    westToEast.forEach((id, i) => setTimeout(() => playStamp(), 1000 + i * 120));

    setTimeout(() => { playSound('scratch'); }, 3000);

    setTimeout(() => { playStamp(); }, 5000);

    setTimeout(() => {
      document.getElementById('tutorial-line').textContent = 'Ink is proven. Pencil is a guess. Ships pay out on both — pencil pays more, and pencil can be wrong.';
      document.getElementById('tutorial-line').style.opacity = '1';
      playSound('typewriter');
    }, 6000);

    setTimeout(() => {
      document.getElementById('tutorial-line').textContent = 'Stake it — tap the ship, then a port.';
      const s = game.getState();
      const firstShip = s.ships[0];
      if (firstShip) { const el = document.querySelector(`[data-ship="${firstShip.id}"]`); if (el) el.classList.add('lift'); }
    }, 8000);

    setTimeout(() => { document.getElementById('tutorial-line').style.opacity = '0'; }, 16000);

    introDone = true;
  }

  // ── boot ─────────────────────────────────────────────────────────────
  function newChart(seed) {
    stopAutoplay();
    lastWitnessLen = 0; firstScarShown = false; selectedShipId = null; pendingStake = null;
    game = new GameEngine({ seed: seed || ('run-' + Math.random().toString(36).slice(2, 10)) });
    window.pencilStakesPlaced = 0; window.inkStakesPlaced = 0;
    cashDisplayed = game.getState().company.cash;
    game.giftStartingShip('feeder'); // the first ship is already at home (Fable §4, t=0:08) — a gift, not a purchase
    window.__clt = { game, tick: tickOnce, refresh, startAutoplay, stopAutoplay, isPaused };
    refresh();
    playIntro(game.getState());
    startAutoplay();
  }

  document.addEventListener('DOMContentLoaded', () => {
    // fx layer + persistent ship layer, siblings of the redrawn static layer
    const svg = svgEl('svg');
    svg.setAttribute('id', 'chart');
    svg.setAttribute('viewBox', `0 0 ${MAP_W} ${MAP_H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const staticUnder = svgEl('g'); staticUnder.id = 'static-under';
    const shipLayer = svgEl('g'); shipLayer.id = 'ship-layer';
    const staticOver = svgEl('g'); staticOver.id = 'static-over';
    const fx = svgEl('g'); fx.id = 'fx-layer';
    svg.appendChild(staticUnder); svg.appendChild(shipLayer); svg.appendChild(staticOver); svg.appendChild(fx);
    document.getElementById('chart-pane').prepend(svg);

    // tap the sheet (not a ship/port/shipyard) -> pause/resume
    document.getElementById('chart-pane').addEventListener('click', () => {
      if (isPaused()) startAutoplay(); else stopAutoplay();
    });

    document.getElementById('new-chart-btn').addEventListener('click', (ev) => {
      ev.stopPropagation();
      const seed = window.prompt('New chart — seed (blank = random):', '');
      newChart(seed);
    });

    document.getElementById('mute-btn').addEventListener('click', (ev) => {
      ev.stopPropagation();
      muted = !muted;
      try { localStorage.setItem('clt_muted', muted ? '1' : '0'); } catch (e) { /* per-viewer convenience only */ }
      document.getElementById('mute-state').textContent = muted ? 'off' : 'on';
    });
    document.getElementById('mute-state').textContent = muted ? 'off' : 'on';

    // ?seed=xxx is a headless-verification convenience only (Playwright
    // predicate: same seed => same fixed-seed replay hash) — the player-
    // facing affordance is still exactly one margin link (Fable §3.2).
    let initialSeed = null;
    try { initialSeed = new URLSearchParams(window.location.search).get('seed'); } catch (e) { /* ignore */ }
    newChart(initialSeed);
  });
})();
