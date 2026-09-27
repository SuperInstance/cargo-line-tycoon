// Cargo Line Tycoon — Phase 1 browser UI. Browser-only (not dual-mode): this
// file wires window.CLTEngine (which wraps the deterministic kernel) to the
// DOM. It never makes gameplay decisions itself — every action goes through
// GameEngine methods, so what you see here is exactly what game/test/*.js
// exercises headlessly.
(function () {
  'use strict';

  const { GameEngine, SHIP_CLASSES, PORTS, PORTS_BY_ID, STARTING_CASH, HOME_PORT_ID, CHOKEPOINTS } = window.CLTEngine;
  const { WEST_COAST, EAST_GULF_COAST } = window.CLT_PORTS;
  const { describe: describeProvenance } = window.CLTProvenance;

  let game = null;
  let autoplayTimer = null;

  // ── projection: lat/lng -> a clean schematic, not literal cartography ──
  // Phase 2: widened from a US/CA-only window to a world strip (the map
  // grows with the world, matching CARGO-LINE-TYCOON.md §3's "the world
  // visibly grows" progression idea) — Rotterdam, Singapore, and Ras Tanura
  // now fit alongside the original 10 ports.
  const LNG_MIN = -130, LNG_MAX = 108, LAT_MIN = -4, LAT_MAX = 56;
  const MAP_W = 1180, MAP_H = 560, PAD = 55;

  function project(lat, lng) {
    const x = PAD + ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * (MAP_W - 2 * PAD);
    const y = PAD + ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * (MAP_H - 2 * PAD);
    return { x, y };
  }

  const PORT_XY = {};
  for (const p of PORTS) PORT_XY[p.id] = project(p.lat, p.lng);
  // Los Angeles and Long Beach are real, adjacent (San Pedro Bay complex) —
  // at this map's zoom they'd otherwise land on almost the same pixel and
  // their dots/labels would collide. A small fixed cosmetic nudge, purely
  // for label legibility; it changes no game data or distance calculation
  // (those still use the real lat/lng from game/data/ports.js).
  PORT_XY.long_beach.x += 14;
  PORT_XY.long_beach.y += 12;

  // Full port names are used everywhere except the map, where a few are too
  // long for their pixel neighborhood (e.g. "New York and New Jersey" runs
  // past the right edge near its real, near-the-border longitude).
  const MAP_LABELS = { new_york: 'New York' };
  function mapLabel(port) { return MAP_LABELS[port.id] || shortName(port); }

  function centroid(ids) {
    let x = 0, y = 0;
    for (const id of ids) { x += PORT_XY[id].x; y += PORT_XY[id].y; }
    return { x: x / ids.length, y: y / ids.length };
  }
  const WEST_C = centroid(WEST_COAST);
  const EAST_C = centroid(EAST_GULF_COAST);
  const PANAMA_XY = { x: (WEST_C.x + EAST_C.x) / 2, y: Math.max(WEST_C.y, EAST_C.y) + 65 };

  // Phase 2: the 5 new chokepoints, projected from their real lat/lng
  // (game/data/chokepoints.js) — unlike PANAMA_XY above (a synthetic
  // schematic point kept as-is so the existing coastal ship animation never
  // changes), these use the same literal project() every port uses.
  const CHOKEPOINT_XY = {};
  for (const id of Object.keys(CHOKEPOINTS)) {
    if (id === 'panama') continue; // panama keeps its own synthetic PANAMA_XY above
    CHOKEPOINT_XY[id] = project(CHOKEPOINTS[id].lat, CHOKEPOINTS[id].lng);
  }

  // A leg's full waypoint path: origin -> each chokepoint it transits, in
  // real travel order (game/src/economy.js already orders chokepointsUsed
  // correctly per-direction) -> destination. Panama resolves to its own
  // synthetic PANAMA_XY; every other chokepoint uses its real projected spot.
  function waypointsForLeg(originId, destId, chokepointIds) {
    const pts = [PORT_XY[originId]];
    for (const cpId of (chokepointIds || [])) pts.push(cpId === 'panama' ? PANAMA_XY : CHOKEPOINT_XY[cpId]);
    pts.push(PORT_XY[destId]);
    return pts;
  }

  // Interpolate a point along an arbitrary N-waypoint polyline (equal-length
  // segments — this is a schematic map, not literal cartography, so real
  // per-leg distance weighting isn't needed for a legible ship-motion cue).
  function pointAlongPath(pts, frac) {
    const segs = pts.length - 1;
    if (segs <= 0) return pts[0];
    const t = Math.max(0, Math.min(1, frac)) * segs;
    const i = Math.min(segs - 1, Math.floor(t));
    const lf = t - i;
    const a = pts[i], b = pts[i + 1];
    return { x: a.x + (b.x - a.x) * lf, y: a.y + (b.y - a.y) * lf };
  }

  function shortName(port) {
    return port.name.replace(/^Port of /, '').replace('PortMiami', 'Miami');
  }

  // A first-time player shouldn't default into an 8-mile LA<->Long Beach
  // hop, and definitely shouldn't default into a structurally-losing pair
  // (a port whose commodity is worth far less than the origin's — real
  // money, every time, no matter how well they play). Suggest the
  // nearest-to-1000nm port whose base price is at least as good as the
  // origin's; players remain free to pick any of the 10 ports either way,
  // including a deliberately adventurous or bad one.
  function suggestDestination(fromPortId) {
    const economy = window.CLTEconomy;
    const originBase = economy.basePriceForPort(fromPortId);
    let best = null, bestScore = -Infinity;
    for (const p of PORTS) {
      if (p.id === fromPortId) continue;
      if (economy.basePriceForPort(p.id) < originBase) continue;
      const nm = economy.haversineNm(PORTS_BY_ID[fromPortId], p);
      const score = -Math.abs(nm - 1000);
      if (score > bestScore) { bestScore = score; best = p.id; }
    }
    if (best) return best;
    // Every other port is worth less (shouldn't happen from any of our 10
    // ports, but just in case): fall back to the least-bad option.
    let fallback = null, fallbackBase = -Infinity;
    for (const p of PORTS) {
      if (p.id === fromPortId) continue;
      const base = economy.basePriceForPort(p.id);
      if (base > fallbackBase) { fallbackBase = base; fallback = p.id; }
    }
    return fallback || fromPortId;
  }

  function fmtMoney(n) {
    return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString();
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── rendering ────────────────────────────────────────────────────

  function renderMap(state) {
    const disrupted = state.panama.disrupted;

    let routesSvg = '';
    for (const route of state.routes) {
      const shipId = route.assignedShipIds && route.assignedShipIds[0];
      const ship = shipId && state.ships.find((s) => s.id === shipId);
      // The route's own fixed corridor (outbound order fromPortId->toPortId),
      // read via the same GameEngine method the UI's live preview uses —
      // never a UI-side reimplementation of routing.
      const preview = ship ? game.previewRoute(route.fromPortId, route.toPortId, ship.classId) : null;
      const chokepointsUsed = preview && preview.ok ? preview.chokepointsUsed : (route.usesPanama ? ['panama'] : []);
      const pts = waypointsForLeg(route.fromPortId, route.toPortId, chokepointsUsed);
      const anyDisrupted = chokepointsUsed.some((id) => (state.chokepoints[id] ? state.chokepoints[id].status : (id === 'panama' && disrupted ? 'disrupted' : 'open')) !== 'open');
      const cls = ['route-line'];
      if (chokepointsUsed.length) cls.push('panama');
      if (anyDisrupted) cls.push('disrupted');
      const d = `M ${pts.map((p) => `${p.x} ${p.y}`).join(' L ')}`;
      routesSvg += `<path class="${cls.join(' ')}" d="${d}"></path>`;
    }

    let shipsSvg = '';
    for (const ship of state.ships) {
      if (!ship.transit) continue;
      const t = ship.transit;
      const originId = t.leg === 'outbound' ? t.routeFrom : t.routeTo;
      const destId = t.leg === 'outbound' ? t.routeTo : t.routeFrom;
      const frac = t.legTotalTicks ? 1 - t.ticksRemaining / t.legTotalTicks : 0;
      const pts = waypointsForLeg(originId, destId, t.chokepointsUsed);
      const pos = pointAlongPath(pts, frac);
      shipsSvg += `<circle class="ship-dot" cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="5"><title>${escapeHtml(ship.id)}</title></circle>`;
    }

    let portsSvg = '';
    for (const port of PORTS) {
      const xy = PORT_XY[port.id];
      const r = port.tier === 1 ? 7 : 5;
      const isHome = port.id === HOME_PORT_ID;
      portsSvg += `<circle class="port-dot${isHome ? ' home' : ''}" cx="${xy.x}" cy="${xy.y}" r="${r}"><title>${escapeHtml(port.name)}</title></circle>`;
      portsSvg += `<text class="port-label" x="${xy.x + r + 4}" y="${xy.y + 4}">${escapeHtml(mapLabel(port))}</text>`;
    }

    const panamaMarkerCls = ['panama-marker']; if (disrupted) panamaMarkerCls.push('disrupted');
    const panamaDotCls = ['panama-dot']; if (disrupted) panamaDotCls.push('disrupted');
    const panamaLabelCls = ['panama-label']; if (disrupted) panamaLabelCls.push('disrupted');
    const panamaSvg = `
      <path class="${panamaMarkerCls.join(' ')}" d="M ${WEST_C.x} ${WEST_C.y + 8} Q ${PANAMA_XY.x} ${PANAMA_XY.y} ${EAST_C.x} ${EAST_C.y + 8}"></path>
      <circle class="${panamaDotCls.join(' ')}" cx="${PANAMA_XY.x}" cy="${PANAMA_XY.y}" r="4"></circle>
      <text class="${panamaLabelCls.join(' ')}" x="${PANAMA_XY.x}" y="${PANAMA_XY.y + 18}" text-anchor="middle">${disrupted ? '⚠ Panama Canal — seeded slowdown' : 'Panama Canal'}</text>
    `;

    // Phase 2: the 5 new chokepoints, colored by their *current* status
    // (real canon fact, or a simulated pencil update — either way, this is
    // what routing actually reads; see the Chokepoints panel for which is
    // which).
    let chokeSvg = '';
    for (const id of Object.keys(CHOKEPOINT_XY)) {
      const xy = CHOKEPOINT_XY[id];
      const status = state.chokepoints[id].status;
      chokeSvg += `<circle class="choke-dot status-${status}" cx="${xy.x}" cy="${xy.y}" r="5"><title>${escapeHtml(CHOKEPOINTS[id].name)} — ${escapeHtml(status)}</title></circle>`;
      chokeSvg += `<text class="choke-map-label status-${status}" x="${xy.x}" y="${xy.y - 9}" text-anchor="middle">${escapeHtml(shortChokeName(id))}</text>`;
    }

    document.getElementById('map-wrap').innerHTML =
      `<svg id="map" viewBox="0 0 ${MAP_W} ${MAP_H}" preserveAspectRatio="xMidYMid meet">${panamaSvg}${chokeSvg}${routesSvg}${portsSvg}${shipsSvg}</svg>`;
  }

  function shortChokeName(id) {
    return { suez: 'Suez', bab_el_mandeb: 'Bab-el-Mandeb', hormuz: 'Hormuz', malacca: 'Malacca', gibraltar: 'Gibraltar' }[id] || id;
  }

  function renderHeaderAndCompany(state) {
    document.getElementById('hdr-tick').textContent = state.tick;
    document.getElementById('hdr-cash').textContent = fmtMoney(state.company.cash);
    document.getElementById('hdr-seed').textContent = state.seed;

    const cashStat = document.getElementById('stat-cash');
    cashStat.textContent = fmtMoney(state.company.cash);
    cashStat.className = 'value' + (state.company.cash >= STARTING_CASH ? ' green' : (state.company.cash < STARTING_CASH * 0.5 ? ' red' : ''));
    document.getElementById('stat-ships').textContent = state.ships.length;
    document.getElementById('stat-routes').textContent = state.routes.length;
  }

  const ACHIEVEMENT_LABELS = {
    first_profit_double: '🏆 First Profit Double',
    storm_rider: '🏆 Storm Rider',
  };
  function renderAchievements(state) {
    document.getElementById('achievements').innerHTML =
      state.achievements.map((a) => `<span class="badge">${ACHIEVEMENT_LABELS[a] || a}</span>`).join('');
  }

  function renderBanner(state) {
    const banner = document.getElementById('panama-banner');
    if (state.panama.disrupted) {
      banner.className = 'banner show';
      banner.textContent = `✎ Pencil weather — Panama Canal: a seeded slowdown in progress (~${state.panama.ticksRemaining} day(s) left) — trans-coast routes are slower and cost more. Same-coast lanes are unaffected.`;
    } else {
      banner.className = 'banner';
    }
  }

  const CHOKE_STATUS_LABEL = { open: 'Open', congested: 'Congested', disrupted: 'Disrupted' };
  function renderChokepoints(state) {
    document.getElementById('chokepoint-list').innerHTML = Object.keys(state.chokepoints).map((id) => {
      const c = state.chokepoints[id];
      const medium = c.current.isSimulated
        ? '<span class="choke-medium pencil" title="A seeded, in-game simulation of how the real situation might evolve — not new real news.">PENCIL</span>'
        : '<span class="choke-medium ink" title="A researched, dated, sourced real-world fact.">INK</span>';
      const desc = c.current.isSimulated
        ? `${c.current.description}<br><span style="opacity:0.75;">Real, as researched: ${escapeHtml(c.real.description)}</span>`
        : escapeHtml(c.current.description);
      return `<div class="choke-row">
        <div class="head">
          <span class="name">${escapeHtml(c.name)}</span>
          ${medium}
          <span class="choke-status ${c.status}">${CHOKE_STATUS_LABEL[c.status] || c.status}</span>
        </div>
        <div class="desc">${desc}</div>
      </div>`;
    }).join('');
  }

  function renderWorldFacts(state) {
    const f = state.worldFacts;
    document.getElementById('world-facts').innerHTML = `
      <div class="fact-row">
        <div class="label">Bunker fuel (VLSFO)</div>
        <div class="val">${fmtMoney(f.bunkerFuelUsdPerTonne.value)}/tonne <span style="color:var(--ink-dim);font-weight:400;font-size:0.85em;">&times; ${f.fuelIndexMult.toFixed(2)} on daily ops</span></div>
        <div class="desc">${escapeHtml(f.bunkerFuelUsdPerTonne.description)}</div>
      </div>
      <div class="fact-row">
        <div class="label">Freight index (Drewry WCI)</div>
        <div class="val">${fmtMoney(f.freightIndexUsdPer40ft.value)}/40ft <span style="color:var(--ink-dim);font-weight:400;font-size:0.85em;">&times; ${f.freightIndexMult.toFixed(2)} on base prices</span></div>
        <div class="desc">${escapeHtml(f.freightIndexUsdPer40ft.description)}</div>
      </div>
      <div class="fact-row">
        <div class="label">Panama Canal (real, current)</div>
        <div class="desc">${escapeHtml(f.panamaCanon.description)}</div>
      </div>
    `;
  }

  function renderBuyGrid(state) {
    const grid = document.getElementById('buy-grid');
    grid.innerHTML = Object.values(SHIP_CLASSES).map((cls) => `
      <div class="buy-card">
        <div class="title">${cls.name}</div>
        <div class="stats">${cls.capacityTeu.toLocaleString()} TEU &middot; ${cls.speedKn} kn</div>
        <div class="stats">${fmtMoney(cls.purchaseCost)} &middot; ${fmtMoney(cls.dailyOpCost)}/day</div>
        <div class="blurb">${escapeHtml(cls.blurb)}${!cls.canTransitPanama ? ' Coastal lanes only.' : ''}</div>
        <button data-buy="${cls.id}" ${state.company.cash < cls.purchaseCost ? 'disabled' : ''}>Buy</button>
      </div>
    `).join('');
    grid.querySelectorAll('[data-buy]').forEach((btn) => btn.addEventListener('click', () => {
      const r = game.buyShip(btn.getAttribute('data-buy'));
      if (!r.ok) alert(r.reason);
      refresh();
    }));
  }

  function renderFleet(state) {
    const list = document.getElementById('fleet-list');
    const empty = document.getElementById('fleet-empty');
    if (state.ships.length === 0) {
      list.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    const portOptions = PORTS.map((p) => `<option value="${p.id}">${escapeHtml(shortName(p))}</option>`).join('');

    list.innerHTML = state.ships.map((ship) => {
      const cls = SHIP_CLASSES[ship.classId];
      if (ship.transit) {
        const t = ship.transit;
        const pct = t.legTotalTicks ? Math.round(100 * (1 - t.ticksRemaining / t.legTotalTicks)) : 0;
        const originId = t.leg === 'outbound' ? t.routeFrom : t.routeTo;
        const destId = t.leg === 'outbound' ? t.routeTo : t.routeFrom;
        return `
          <div class="ship-row" style="flex-direction:column;align-items:stretch;">
            <div style="display:flex;gap:0.6em;align-items:center;flex-wrap:wrap;">
              <span class="name">${escapeHtml(ship.id)}</span>
              <span class="meta">${escapeHtml(cls.name)} &middot; ${escapeHtml(shortName(PORTS_BY_ID[originId]))} &rarr; ${escapeHtml(shortName(PORTS_BY_ID[destId]))}${t.usesPanama ? ' &#9875; via Panama' : ''}</span>
              <button class="secondary" data-unassign="${ship.id}" style="padding:0.3em 0.6em;font-size:0.78em;">Recall</button>
            </div>
            <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
          </div>`;
      }
      return `
        <div class="ship-row" style="flex-direction:column;align-items:stretch;">
          <div style="display:flex;gap:0.6em;align-items:center;flex-wrap:wrap;">
            <span class="name">${escapeHtml(ship.id)}</span>
            <span class="meta">${escapeHtml(cls.name)} &middot; idle at ${escapeHtml(shortName(PORTS_BY_ID[ship.positionPortId]))}</span>
          </div>
          <div class="assign-form">
            <select data-from="${ship.id}">${portOptions}</select>
            <span style="color:var(--ink-dim);">&rarr;</span>
            <select data-to="${ship.id}">${portOptions}</select>
            <button data-assign="${ship.id}">Assign</button>
          </div>
          <div class="preview" data-preview="${ship.id}"></div>
        </div>`;
    }).join('');

    list.querySelectorAll('[data-unassign]').forEach((btn) => btn.addEventListener('click', () => {
      game.unassignShip(btn.getAttribute('data-unassign'));
      refresh();
    }));
    list.querySelectorAll('[data-assign]').forEach((btn) => btn.addEventListener('click', () => {
      const shipId = btn.getAttribute('data-assign');
      const from = list.querySelector(`[data-from="${shipId}"]`).value;
      const to = list.querySelector(`[data-to="${shipId}"]`).value;
      const r = game.assignShip(shipId, from, to);
      if (!r.ok) alert(r.reason);
      refresh();
    }));

    state.ships.forEach((ship) => {
      if (ship.transit) return;
      const fromSel = list.querySelector(`[data-from="${ship.id}"]`);
      const toSel = list.querySelector(`[data-to="${ship.id}"]`);
      if (!fromSel) return;
      fromSel.value = ship.positionPortId;
      toSel.value = suggestDestination(ship.positionPortId);
      const preview = list.querySelector(`[data-preview="${ship.id}"]`);
      const updatePreview = () => {
        if (fromSel.value === toSel.value) { preview.textContent = 'Pick two different ports.'; return; }
        const r = game.previewRoute(fromSel.value, toSel.value, ship.classId);
        if (!r.ok) { preview.textContent = r.reason; return; }
        const chokeNote = (r.chokepointsUsed && r.chokepointsUsed.length)
          ? ` · via ${r.chokepointsUsed.map((id) => (id === 'panama' ? 'Panama' : shortChokeName(id))).join(' + ')} (${fmtMoney(r.tollTotal)} toll/risk)`
          : '';
        preview.textContent = `${Math.round(r.distanceNm)} nm · ${r.legDurationTicks} day(s)/leg${chokeNote}`;
      };
      fromSel.addEventListener('change', updatePreview);
      toSel.addEventListener('change', updatePreview);
      updatePreview();
    });
  }

  function renderMarkets(state) {
    document.getElementById('market-list').innerHTML = PORTS.map((p) => {
      const m = state.markets[p.id];
      const pct = Math.round(((m.price - m.basePrice) / m.basePrice) * 100);
      const dcls = pct > 0 ? 'up' : (pct < 0 ? 'down' : '');
      return `<div class="market-row">
        <span class="port">${escapeHtml(shortName(p))} <span style="color:var(--ink-dim);font-size:0.8em;">(${escapeHtml(p.commodity.replace('_', ' '))})</span></span>
        <span class="price">${fmtMoney(m.price)}</span>
        <span class="delta ${dcls}">${pct > 0 ? '+' : ''}${pct}%</span>
      </div>`;
    }).join('');
  }

  function renderLog(state) {
    document.getElementById('log').innerHTML = state.log.map((e) => {
      const cls = /🏆/.test(e.msg) ? 'achievement' : (/⚠/.test(e.msg) ? 'disruption' : '');
      return `<div class="entry ${cls}"><span class="t">day ${e.tick}</span>${escapeHtml(e.msg)}</div>`;
    }).join('');
  }

  function refresh() {
    const state = game.getState();
    renderHeaderAndCompany(state);
    renderAchievements(state);
    renderBanner(state);
    renderBuyGrid(state);
    renderFleet(state);
    renderMarkets(state);
    renderChokepoints(state);
    renderWorldFacts(state);
    renderLog(state);
    renderMap(state);
  }

  // ── controls ─────────────────────────────────────────────────────

  function stopAutoplay() {
    if (autoplayTimer) { clearInterval(autoplayTimer); autoplayTimer = null; }
    document.getElementById('play-btn').textContent = '▶ Auto-play';
  }

  document.getElementById('step-btn').addEventListener('click', () => { game.tick(); refresh(); });

  document.getElementById('play-btn').addEventListener('click', () => {
    if (autoplayTimer) {
      stopAutoplay();
    } else {
      autoplayTimer = setInterval(() => { game.tick(); refresh(); }, 650);
      document.getElementById('play-btn').textContent = '⏸ Pause';
    }
  });

  document.getElementById('new-run-btn').addEventListener('click', () => {
    stopAutoplay();
    document.getElementById('start-screen').classList.remove('hidden');
  });

  function startGame() {
    const seedInput = document.getElementById('seed-input').value.trim();
    const seed = seedInput || ('run-' + Math.random().toString(36).slice(2, 10));
    game = new GameEngine({ seed });
    document.getElementById('start-screen').classList.add('hidden');
    refresh();
  }

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('seed-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startGame();
  });
})();
