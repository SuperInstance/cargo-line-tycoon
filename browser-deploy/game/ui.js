// Cargo Line Tycoon — Phase 1 browser UI. Browser-only (not dual-mode): this
// file wires window.CLTEngine (which wraps the deterministic kernel) to the
// DOM. It never makes gameplay decisions itself — every action goes through
// GameEngine methods, so what you see here is exactly what game/test/*.js
// exercises headlessly.
(function () {
  'use strict';

  const { GameEngine, SHIP_CLASSES, PORTS, PORTS_BY_ID, STARTING_CASH, HOME_PORT_ID } = window.CLTEngine;
  const { WEST_COAST, EAST_GULF_COAST } = window.CLT_PORTS;

  let game = null;
  let autoplayTimer = null;

  // ── projection: lat/lng -> a clean schematic, not literal cartography ──
  const LNG_MIN = -126, LNG_MAX = -72, LAT_MIN = 23, LAT_MAX = 51;
  const MAP_W = 900, MAP_H = 600, PAD = 60;

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

  function pointAlongLeg(originId, destId, usesPanama, frac) {
    const a = PORT_XY[originId];
    const b = PORT_XY[destId];
    if (!usesPanama) {
      return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
    }
    const m = PANAMA_XY;
    if (frac < 0.5) {
      const f2 = frac / 0.5;
      return { x: a.x + (m.x - a.x) * f2, y: a.y + (m.y - a.y) * f2 };
    }
    const f2 = (frac - 0.5) / 0.5;
    return { x: m.x + (b.x - m.x) * f2, y: m.y + (b.y - m.y) * f2 };
  }

  // ── rendering ────────────────────────────────────────────────────

  function renderMap(state) {
    const disrupted = state.panama.disrupted;
    let routesSvg = '';
    for (const route of state.routes) {
      const a = PORT_XY[route.fromPortId];
      const b = PORT_XY[route.toPortId];
      const cls = ['route-line'];
      if (route.usesPanama) cls.push('panama');
      if (route.usesPanama && disrupted) cls.push('disrupted');
      const d = route.usesPanama
        ? `M ${a.x} ${a.y} L ${PANAMA_XY.x} ${PANAMA_XY.y} L ${b.x} ${b.y}`
        : `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
      routesSvg += `<path class="${cls.join(' ')}" d="${d}"></path>`;
    }

    let shipsSvg = '';
    for (const ship of state.ships) {
      if (!ship.transit) continue;
      const t = ship.transit;
      const originId = t.leg === 'outbound' ? t.routeFrom : t.routeTo;
      const destId = t.leg === 'outbound' ? t.routeTo : t.routeFrom;
      const frac = t.legTotalTicks ? 1 - t.ticksRemaining / t.legTotalTicks : 0;
      const pos = pointAlongLeg(originId, destId, t.usesPanama, Math.max(0, Math.min(1, frac)));
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
      <text class="${panamaLabelCls.join(' ')}" x="${PANAMA_XY.x}" y="${PANAMA_XY.y + 18}" text-anchor="middle">${disrupted ? '⚠ Panama Canal — disrupted' : 'Panama Canal'}</text>
    `;

    document.getElementById('map-wrap').innerHTML =
      `<svg id="map" viewBox="0 0 ${MAP_W} ${MAP_H}" preserveAspectRatio="xMidYMid meet">${panamaSvg}${routesSvg}${portsSvg}${shipsSvg}</svg>`;
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
      banner.textContent = `⚠ Panama Canal disruption in progress (~${state.panama.ticksRemaining} day(s) left) — trans-coast routes are slower and cost more. Same-coast lanes are unaffected.`;
    } else {
      banner.className = 'banner';
    }
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
        preview.textContent = r.ok
          ? `${Math.round(r.distanceNm)} nm · ${r.legDurationTicks} day(s)/leg${r.usesPanama ? ` · Panama toll ${fmtMoney(r.tollTotal)}` : ''}`
          : r.reason;
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
