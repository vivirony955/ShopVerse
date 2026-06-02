#!/usr/bin/env node
// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * W5.T2 — plugin frontend bundle budget gate.
 *
 * Runs `next build`, parses the per-route table, and compares each
 * route's First Load JS against the committed baseline in
 * `frontend/bundle-budget.json`. Per plan §5 #6, a plugin's
 * contribution to a page is capped at 50KB minified; since slots are
 * compile-time per plan §4 the script cannot natively attribute
 * bytes per plugin, so the v1 gate is REGRESSION-based: it fails when
 * any route's First Load JS grows beyond a per-route delta budget.
 *
 * Usage:
 *   node scripts/check-bundle-budget.js              # measure + gate
 *   node scripts/check-bundle-budget.js --baseline   # rewrite baseline
 *
 * The baseline is rewritten only when a code change deliberately
 * shifts the bundle (e.g., a new plugin landing); CI runs the script
 * without `--baseline` and gates merges.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(ROOT, 'bundle-budget.json');

// Per-route First Load JS regression cap. W5.T2 / plan §5 #6 says a
// plugin's per-page contribution is ≤ 50KB; we use the same number
// as the per-route delta cap so a single plugin's bundle landing
// trips the gate at the wrong page.
const DELTA_CAP_KB = 50;
const REWRITE_BASELINE = process.argv.includes('--baseline');

function parseKb(s) {
  // Handles formats like "10 kB", "10.6 kB", "225 kB", "990 B".
  const m = s.trim().match(/^([\d.]+)\s*(kB|B)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === 'B' ? n / 1024 : n;
}

/**
 * Parse the next build route table from stdout. Returns
 * `{ "/route": { size: kb, firstLoadJs: kb } }`.
 */
function parseRouteTable(stdout) {
  const routes = {};
  const lines = stdout.split('\n');
  for (const line of lines) {
    // Lines look like:
    //   ├ ○ /products                  4.2 kB         219 kB
    //   ├ ƒ /products/[id]              10.6 kB         225 kB
    //   └ ○ /wishlist                  5.09 kB         214 kB
    const stripped = line.replace(/^[├└┌│]+\s*[○ƒ]\s*/, '');
    const m = stripped.match(/^(\/\S*)\s+([\d.]+\s*(?:kB|B))\s+([\d.]+\s*(?:kB|B))\s*$/);
    if (!m) continue;
    const [, route, sizeStr, firstLoadStr] = m;
    const size = parseKb(sizeStr);
    const firstLoadJs = parseKb(firstLoadStr);
    if (size == null || firstLoadJs == null) continue;
    routes[route] = { size, firstLoadJs };
  }
  return routes;
}

function runNextBuild() {
  console.log('[bundle-budget] running `next build`…');
  const r = spawnSync('npm', ['run', 'build'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    process.stderr.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
    if (r.error) {
      process.stderr.write(`spawn error: ${r.error.message}\n`);
    }
    throw new Error(`next build failed with exit code ${r.status}`);
  }
  return r.stdout;
}

function main() {
  const stdout = runNextBuild();
  const current = parseRouteTable(stdout);
  const routeCount = Object.keys(current).length;
  if (routeCount === 0) {
    console.error('[bundle-budget] no routes parsed from build output — regex out of date?');
    process.exit(2);
  }
  console.log(`[bundle-budget] parsed ${routeCount} routes from build output`);

  if (REWRITE_BASELINE) {
    fs.writeFileSync(
      BASELINE_PATH,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          deltaCapKb: DELTA_CAP_KB,
          routes: current,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`[bundle-budget] baseline rewritten at ${path.basename(BASELINE_PATH)}`);
    process.exit(0);
  }

  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(
      `[bundle-budget] no baseline at ${BASELINE_PATH}. Run with --baseline once to capture.`,
    );
    process.exit(3);
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const baselineRoutes = baseline.routes || {};

  const failures = [];
  for (const [route, { firstLoadJs }] of Object.entries(current)) {
    const prior = baselineRoutes[route]?.firstLoadJs;
    if (prior == null) {
      console.log(`[bundle-budget] new route ${route} = ${firstLoadJs.toFixed(2)} kB (no baseline yet)`);
      continue;
    }
    const delta = firstLoadJs - prior;
    if (delta > DELTA_CAP_KB) {
      failures.push({ route, prior, current: firstLoadJs, delta });
    } else if (Math.abs(delta) > 1) {
      console.log(
        `[bundle-budget] ${route}: ${prior.toFixed(2)} → ${firstLoadJs.toFixed(2)} kB (Δ ${delta > 0 ? '+' : ''}${delta.toFixed(2)} kB, within cap)`,
      );
    }
  }

  if (failures.length > 0) {
    console.error('\n[bundle-budget] FAIL — these routes exceeded the per-route Δ cap:');
    for (const { route, prior, current, delta } of failures) {
      console.error(
        `  ${route}: ${prior.toFixed(2)} → ${current.toFixed(2)} kB (Δ +${delta.toFixed(2)} kB > ${DELTA_CAP_KB} kB cap)`,
      );
    }
    console.error(`\nIf the regression is intentional (e.g. a new plugin landed), rebuild the baseline:`);
    console.error(`  cd frontend && node scripts/check-bundle-budget.js --baseline\n`);
    process.exit(1);
  }

  console.log(`[bundle-budget] OK — no route grew by more than ${DELTA_CAP_KB} kB`);
  process.exit(0);
}

main();
