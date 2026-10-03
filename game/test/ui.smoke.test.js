// P0-5 / P1-3 predicate: the rendered game (the browser-deploy/game/ui.js +
// tycoon-live.html layer) is what ships — game/test/*.js only exercises the
// headless GameEngine, never the DOM. This test loads the *built* dist/
// bundle (scripts/build-dist.mjs's output — the same thing `wrangler pages
// deploy dist` ships) in a real headless browser and asserts the chart
// actually renders: ports draw, a ship draws, the ledger shows a number, and
// there are zero console errors.
//
// Run with: node --test game/test/ui.smoke.test.js  (or via the
// game/test/**/*.test.js glob CI uses).
//
// This test SKIPS (does not fail) when Playwright/Chromium is not available
// — CI does not install browsers for this repo (that's a deliberate, heavy
// opt-in the owner has not asked for), so absence must not redden the gate.
// It runs for real wherever Playwright + a Chromium binary are present
// (e.g. this dev sandbox, PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers).
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
const { execFileSync, execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const DIST = path.join(ROOT, 'dist');

// ── resolve a `playwright` module without requiring it to be an npm
// dependency of this repo (CI never installs it; this dev sandbox has it
// installed globally). Returns null (never throws) if unavailable. ────────
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

// Tiny static file server for dist/ — no deps, just enough to serve the
// build the way `wrangler pages deploy dist` / any static host would.
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

test('the built dist/ Chart renders headlessly: ports + a ship, the ledger, zero console errors', async (t) => {
  const playwright = resolvePlaywright();
  if (!playwright) {
    t.skip('playwright not available in this environment (not installed as a project dep, and no global install found) — skipping UI smoke test, not failing it');
    return;
  }

  // Always rebuild dist/ fresh from source so this test can never pass
  // against a stale bundle.
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-dist.mjs')], { stdio: 'inherit' });
  assert.ok(fs.existsSync(path.join(DIST, 'index.html')), 'dist/index.html must exist after build');

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

    // The offline game makes zero network calls for gameplay; the one
    // external call is the (purely decorative, already flagged P2-1)
    // Google Fonts stylesheet. Fulfilling it with an empty stylesheet
    // exercises the exact "font CDN unreachable -> system-font fallback"
    // path deterministically, instead of making this test's pass/fail
    // depend on outbound network reachability to fonts.googleapis.com from
    // wherever CI happens to run.
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
      route.fulfill({ status: 200, contentType: 'text/css', body: '' }));

    const consoleErrors = [];
    const badResponses = []; // any local (127.0.0.1) response >=400 — a real 404/500 on our own bundle
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message || err}`));
    page.on('response', (res) => {
      if (res.status() >= 400 && res.url().includes('127.0.0.1')) {
        badResponses.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.goto(`http://127.0.0.1:${port}/index.html?seed=ui-smoke-test-1`, { waitUntil: 'load', timeout: 15000 });

    // Ports render immediately on boot (renderStatic); the starter ship is
    // gifted at t=0 (ui.js newChart() -> giftStartingShip), so both should
    // already be in the DOM without waiting on autoplay ticks. Still poll
    // briefly for CI-shared-CPU slack.
    await page.waitForSelector('#chart svg#chart [data-port]', { timeout: 5000 }).catch(() => {});
    await page.waitForSelector('#chart-pane .ship-dot', { timeout: 5000 }).catch(() => {});

    const portCount = await page.locator('[data-port]').count();
    const shipCount = await page.locator('.ship-dot').count();
    const cashText = (await page.locator('#cash-value').textContent()) || '';

    await browser.close();
    browser = null;

    assert.ok(portCount > 0, `expected at least one rendered port, got ${portCount}`);
    assert.ok(shipCount > 0, `expected at least one rendered ship dot (the gifted starter ship), got ${shipCount}`);
    assert.ok(/\$[\d,]+/.test(cashText), `expected the ledger to show a dollar figure, got ${JSON.stringify(cashText)}`);
    assert.strictEqual(badResponses.length, 0, `expected zero 404s/errors from the served bundle, got:\n${badResponses.join('\n')}`);
    assert.strictEqual(consoleErrors.length, 0, `expected zero console errors, got:\n${consoleErrors.join('\n')}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await new Promise((r) => server.close(r));
  }
});
