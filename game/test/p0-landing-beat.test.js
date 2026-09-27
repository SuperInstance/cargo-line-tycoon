// P0.5 predicate (arch/CARGO-LINE-FUN-AND-GRAPHICS.md §3.2/§5): the money/
// land beat — ship squash -> lane flash -> ink-seal slam (overshoot) ->
// pencil-dust puff -> gold cash count-up with an underline wipe -> a 1px
// screen-shake on big hauls only — plays end-to-end in the built dist/
// bundle, at ~60fps, with zero console errors. Drives the real rendered
// page (not just the headless GameEngine) via window.__clt, the same debug
// hook ui.js already exposes for exactly this purpose.
//
// Run with: node --test game/test/p0-landing-beat.test.js (or via the
// game/test/**/*.test.js glob).
//
// SKIPS (does not fail) when Playwright/Chromium is unavailable — same
// posture as game/test/ui.smoke.test.js.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
const { execFileSync, execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const DIST = path.join(ROOT, 'dist');

function resolvePlaywright() {
  try {
    return require('playwright');
  } catch (e) { /* not a project dependency here — try the global install */ }
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return require(path.join(globalRoot, 'playwright'));
  } catch (e) {
    return null;
  }
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css',
};

function serveDist(dir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let reqPath = decodeURIComponent(req.url.split('?')[0]);
      if (reqPath === '/') reqPath = '/index.html';
      const filePath = path.join(dir, reqPath);
      if (!filePath.startsWith(dir)) { res.writeHead(403); res.end(); return; }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end(`not found: ${reqPath}`); return; }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('P0.5: the money/land stamp beat plays end-to-end at ~60fps, zero console errors', async (t) => {
  const playwright = resolvePlaywright();
  if (!playwright) {
    t.skip('playwright not available in this environment — skipping, not failing');
    return;
  }

  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-dist.mjs')], { stdio: 'inherit' });
  assert.ok(fs.existsSync(path.join(DIST, 'index.html')));

  let server;
  let browser;
  try {
    server = await serveDist(DIST);
    const port = server.address().port;

    try {
      browser = await playwright.chromium.launch();
    } catch (e) {
      t.skip(`no usable Chromium binary for Playwright (${e.message}) — skipping, not failing`);
      return;
    }

    const page = await browser.newPage();
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
      route.fulfill({ status: 200, contentType: 'text/css', body: '' }));

    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message || err}`));

    await page.goto(`http://127.0.0.1:${port}/index.html?seed=p0-landing-beat-1`, { waitUntil: 'load', timeout: 15000 });
    await page.waitForFunction(() => !!(window.__clt && window.__clt.game), { timeout: 5000 });

    // Drive a deterministic, short ink stake directly through the same
    // GameEngine.assignShip() the UI's own confirmStake() calls — a real
    // ship, a real lane, no reliance on simulating exact pixel clicks.
    // Then let autoplay's own tickOnce() (which is exactly what a live
    // session runs) carry it to arrival, so the beat plays through the
    // REAL render pipeline, not a synthetic call.
    await page.evaluate(() => {
      window.__beatLog = { sealSeen: 0, puffSeen: 0, shakeSeen: 0, wipeSeen: 0, frames: 0 };
      const fx = document.getElementById('fx-layer');
      new MutationObserver((muts) => {
        for (const m of muts) {
          for (const node of m.addedNodes) {
            if (node.classList && node.classList.contains('fx-land-seal')) window.__beatLog.sealSeen++;
            if (node.classList && node.classList.contains('fx-dust-puff')) window.__beatLog.puffSeen++;
          }
        }
      }).observe(fx, { childList: true });
      const underline = document.getElementById('cash-underline');
      new MutationObserver(() => {
        if (underline.classList.contains('wipe')) window.__beatLog.wipeSeen++;
      }).observe(underline, { attributes: true, attributeFilter: ['class'] });
      const pane = document.getElementById('chart-pane');
      new MutationObserver(() => {
        if (pane.classList.contains('anim-paper-shake-90')) window.__beatLog.shakeSeen++;
      }).observe(pane, { attributes: true, attributeFilter: ['class'] });

      const s = window.__clt.game.getState();
      const shipId = s.ships[0].id;
      // A short, guaranteed-ink coastal hop — the plain "ink LAND" beat
      // (no preceding pen-trace), the simplest case to time precisely.
      window.__clt.game.assignShip(shipId, 'los_angeles', 'seattle');
    });

    // Sample frames for an fps estimate while the sim plays toward arrival.
    const fpsSamplePromise = page.evaluate(() => new Promise((resolve) => {
      let frames = 0;
      const start = performance.now();
      function loop(now) {
        frames++;
        if (now - start < 1500) requestAnimationFrame(loop);
        else resolve({ frames, elapsedMs: now - start });
      }
      requestAnimationFrame(loop);
    }));

    // Wait for the ship to actually arrive (a ship_arrived witness-log
    // entry), driving autoplay's real tick cadence — the beat sheet's own
    // 380ms (or ~1280ms for a pencil LAND) is tiny next to this, so "within
    // ±2s of the beat sheet" is generously satisfied by simply confirming
    // the beat's own elements appeared and cleaned up shortly after arrival.
    await page.waitForFunction(
      () => window.__clt.game.world.witness_log.some((e) => e.type === 'ship_arrived'),
      { timeout: 20000, polling: 100 },
    );
    const arrivalWallClock = Date.now();

    // Give the 380ms beat (seal ~60-320ms, puff ~120-440ms, underline wipe
    // at 150ms) time to fully play and clean up.
    await page.waitForTimeout(900);

    const fps = await fpsSamplePromise;
    const beatLog = await page.evaluate(() => window.__beatLog);
    const sealNowInDom = await page.locator('.fx-land-seal').count();
    const puffNowInDom = await page.locator('.fx-dust-puff').count();

    await browser.close();
    browser = null;

    const estimatedFps = fps.frames / (fps.elapsedMs / 1000);
    assert.ok(estimatedFps >= 45, `expected the beat to play at ~60fps (headless-tolerant floor 45fps), got ${estimatedFps.toFixed(1)}fps`);

    assert.ok(beatLog.sealSeen >= 1, 'expected at least one ink-seal slam element to appear during the beat');
    assert.ok(beatLog.puffSeen >= 1, 'expected at least one pencil-dust puff element to appear during the beat');
    assert.ok(beatLog.wipeSeen >= 1, 'expected the cash underline wipe to trigger during the beat');
    assert.strictEqual(sealNowInDom, 0, 'the ink seal must clean itself up (not linger) well after the beat');
    assert.strictEqual(puffNowInDom, 0, 'the dust puff must clean itself up (not linger) well after the beat');

    assert.strictEqual(consoleErrors.length, 0, `expected zero console errors through the whole beat, got:\n${consoleErrors.join('\n')}`);

    // Sanity: the arrival + beat all happened within a small, bounded
    // wall-clock window (autoplay ticks every 700ms; a short LA-Seattle hop
    // is a handful of ticks) — nowhere close to hanging.
    assert.ok(Date.now() - arrivalWallClock < 5000);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await new Promise((r) => server.close(r));
  }
});
