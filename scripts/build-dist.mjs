#!/usr/bin/env node
// scripts/build-dist.mjs — assemble a self-contained dist/ for the Chart.
//
// browser-deploy/tycoon-live.html is not deployable on its own: it reaches
// outside browser-deploy/ via 11 <script src> paths (`../substrate/ts/src/*`,
// `../game/src/*`, `../game/data/*`). This script copies exactly the files
// tycoon-live.html actually loads into dist/, rewrites each `../X` script src
// to `X` (so it resolves inside dist/), and leaves the one already-relative
// `game/ui.js` src untouched. The result is `wrangler pages deploy dist` (or
// any static file server) with zero 404s and zero reliance on the rest of
// the repo tree being present alongside it.
//
// No dependencies — plain Node (fs/path only). Run: node scripts/build-dist.mjs

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_HTML = join(ROOT, 'browser-deploy', 'tycoon-live.html');
const DIST = join(ROOT, 'dist');

// Every file the page needs, keyed by the path it must resolve to *inside*
// dist/ (which is also the rewritten <script src>), valued by where that
// file actually lives in the repo today.
const FILES = {
  'game/ui.js': 'browser-deploy/game/ui.js',
  'substrate/ts/src/index.js': 'substrate/ts/src/index.js',
  'substrate/ts/src/world.js': 'substrate/ts/src/world.js',
  'game/src/provenance.js': 'game/src/provenance.js',
  'game/src/economy.js': 'game/src/economy.js',
  'game/src/pencil.js': 'game/src/pencil.js',
  'game/src/engine.js': 'game/src/engine.js',
  'game/data/pool.js': 'game/data/pool.js',
  'game/data/chokepoints.js': 'game/data/chokepoints.js',
  'game/data/fuel_freight_snapshot.js': 'game/data/fuel_freight_snapshot.js',
  'game/data/ports.js': 'game/data/ports.js',
  'game/data/coastline.js': 'game/data/coastline.js',
};

// P1 graphics-pass static raster assets (§3.4): FLUX-schnell textures/
// accents referenced via CSS `url()` / SVG `<image href>`, never via
// `<script src>` — so unlike FILES above they are plain-copied, not
// verified against a matching escaping-script tag. They are already
// same-directory-relative in the source page (`assets/x.jpg`, exactly like
// `game/ui.js`), so no path rewriting is needed for them either — copying
// browser-deploy/assets/* to dist/assets/* preserves the reference as-is.
// Local files (not data-URIs) so each loads once and is browser-cacheable,
// while staying just as offline-first as a data-URI would be — dist/ is
// fully self-contained either way (see the zero-external-request predicate
// in game/test/ui.smoke.test.js).
const ASSETS = {
  'assets/paper-grain.jpg': 'browser-deploy/assets/paper-grain.jpg',
  'assets/sea-texture.jpg': 'browser-deploy/assets/sea-texture.jpg',
  'assets/wax-lane.jpg': 'browser-deploy/assets/wax-lane.jpg',
  'assets/ink-seal.jpg': 'browser-deploy/assets/ink-seal.jpg',
  'assets/compass-rose.jpg': 'browser-deploy/assets/compass-rose.jpg',
  'assets/coastal-hatch.jpg': 'browser-deploy/assets/coastal-hatch.jpg',
  'assets/ship-wake.jpg': 'browser-deploy/assets/ship-wake.jpg',
  'assets/hero.jpg': 'browser-deploy/assets/hero.jpg',
};

function log(msg) { console.log(`[build-dist] ${msg}`); }

export function buildDist() {
  if (!existsSync(SRC_HTML)) {
    throw new Error(`missing source page: ${SRC_HTML}`);
  }

  // Clean slate so a stale file from a previous build can never linger.
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  let html = readFileSync(SRC_HTML, 'utf8');

  // Rewrite every `<script src="../...">` to the path-inside-dist form. The
  // one script that is already deploy-root-relative (`game/ui.js`) is left
  // as-is by construction (its regex match requires a leading `../`).
  const scriptSrcRe = /<script src="(\.\.\/[^"]+)">/g;
  const foundEscaping = new Set();
  html = html.replace(scriptSrcRe, (match, src) => {
    foundEscaping.add(src);
    const rewritten = src.replace(/^(\.\.\/)+/, '');
    return `<script src="${rewritten}">`;
  });

  // Verify every file the (now-rewritten) HTML references is one we copy,
  // and that every FILES entry actually exists on disk — fail loudly rather
  // than silently shipping a bundle with a 404 in it.
  const expectedEscaping = new Set(Object.keys(FILES).filter((p) => p !== 'game/ui.js').map((p) => '../' + p));
  for (const src of foundEscaping) {
    if (!expectedEscaping.has(src)) {
      throw new Error(
        `tycoon-live.html references an escaping script not in the build manifest: ${src}\n` +
        `Add it to FILES in scripts/build-dist.mjs.`
      );
    }
  }
  for (const src of expectedEscaping) {
    if (!foundEscaping.has(src)) {
      throw new Error(
        `build manifest lists ${src} but tycoon-live.html no longer references it — ` +
        `remove it from FILES in scripts/build-dist.mjs (or the page changed and this script is stale).`
      );
    }
  }
  // Confirm the one same-directory script is still there, untouched.
  if (!/<script src="game\/ui\.js">/.test(html)) {
    throw new Error('expected <script src="game/ui.js"> in tycoon-live.html — page structure changed, update this script.');
  }

  writeFileSync(join(DIST, 'index.html'), html, 'utf8');
  log(`wrote dist/index.html (${Object.keys(FILES).length + 0} scripts rewritten/verified)`);

  for (const [destRel, srcRel] of Object.entries(FILES)) {
    const srcAbs = join(ROOT, srcRel);
    const destAbs = join(DIST, destRel);
    if (!existsSync(srcAbs)) {
      throw new Error(`missing source file for dist/${destRel}: ${srcAbs}`);
    }
    mkdirSync(dirname(destAbs), { recursive: true });
    copyFileSync(srcAbs, destAbs);
    log(`copied ${srcRel} -> dist/${destRel}`);
  }

  let assetBytes = 0;
  for (const [destRel, srcRel] of Object.entries(ASSETS)) {
    const srcAbs = join(ROOT, srcRel);
    const destAbs = join(DIST, destRel);
    if (!existsSync(srcAbs)) {
      throw new Error(`missing source asset for dist/${destRel}: ${srcAbs}`);
    }
    mkdirSync(dirname(destAbs), { recursive: true });
    copyFileSync(srcAbs, destAbs);
    assetBytes += readFileSync(srcAbs).length;
    log(`copied ${srcRel} -> dist/${destRel}`);
  }
  log(`P1 raster assets: ${Object.keys(ASSETS).length} files, ${assetBytes} bytes total`);

  log(`dist/ built at ${DIST}`);
  return DIST;
}

// Run when invoked directly (`node scripts/build-dist.mjs`), not when
// imported (e.g. by a test that wants to build then serve dist/ itself).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    buildDist();
  } catch (err) {
    console.error(`[build-dist] FAILED: ${err.message}`);
    process.exit(1);
  }
}
