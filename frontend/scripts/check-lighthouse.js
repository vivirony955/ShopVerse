#!/usr/bin/env node
// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * W5.T10 — Lighthouse delta gate (plan §9 W5 verification #4).
 *
 * Captures Lighthouse scores for PDP + PLP against a configurable
 * base URL and asserts the delta from `frontend/lighthouse-baseline.json`
 * stays within ± 3 points on each of {performance, accessibility,
 * best-practices, SEO}. Also asserts CLS delta ≤ 0.02 (W5.T8 / plan
 * §10 E20 closeout).
 *
 * Status: SCAFFOLD. The runtime check requires:
 *   1. A reachable URL hosting the built Next.js app
 *   2. Headless Chromium available to `lighthouse`
 *   3. `lighthouse` + `chrome-launcher` npm packages installed
 *
 * For W5.T10 we ship the script shape + baseline file + assertion
 * logic; the CI activation rolls forward to W6 when staging URL
 * provisioning lands (alongside k6 / W6.T2). Local devs can run
 * the gate today by:
 *
 *   npm install --no-save lighthouse chrome-launcher
 *   LIGHTHOUSE_BASE_URL=http://localhost:3000 node scripts/check-lighthouse.js
 *
 * Or rebaseline:
 *   LIGHTHOUSE_BASE_URL=http://localhost:3000 \
 *     node scripts/check-lighthouse.js --baseline
 */

const fs = require('node:fs');
const path = require('node:path');
const { findFailures } = require('./lighthouse-delta');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(ROOT, 'lighthouse-baseline.json');

const BASE_URL = process.env.LIGHTHOUSE_BASE_URL;
const REWRITE_BASELINE = process.argv.includes('--baseline');
const PATHS_TO_AUDIT = [
  '/products',          // PLP
  '/products/1',        // PDP (assumes product id=1 is seeded)
];

const CATEGORY_DELTA_CAP = 3;   // points — Lighthouse score is 0–100
const CLS_DELTA_CAP = 0.02;     // plan §10 E20

if (!BASE_URL) {
  console.error('[lighthouse] LIGHTHOUSE_BASE_URL not set.\n');
  console.error('  Locally:  LIGHTHOUSE_BASE_URL=http://localhost:3000 npm run lighthouse:check');
  console.error('  CI:       set the env var to a reachable staging URL.\n');
  console.error('  Skipping (returning 0). When staging URL is wired in W6, this');
  console.error('  becomes a hard fail.');
  process.exit(0);
}

let lighthouse;
let chromeLauncher;
try {
  lighthouse = require('lighthouse');
  chromeLauncher = require('chrome-launcher');
} catch {
  console.error('[lighthouse] `lighthouse` + `chrome-launcher` not installed.\n');
  console.error('  npm install --no-save lighthouse chrome-launcher\n');
  console.error('  Skipping. W6 CI provisioning adds these as dev deps.');
  process.exit(0);
}

async function runOne(urlPath) {
  const url = `${BASE_URL.replace(/\/$/, '')}${urlPath}`;
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const opts = {
      logLevel: 'error',
      output: 'json',
      port: chrome.port,
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    };
    const result = await lighthouse.default
      ? await lighthouse.default(url, opts)
      : await lighthouse(url, opts);
    const lhr = result.lhr;
    const cls = lhr.audits['cumulative-layout-shift']?.numericValue ?? 0;
    return {
      url,
      scores: {
        performance: Math.round((lhr.categories.performance?.score ?? 0) * 100),
        accessibility: Math.round((lhr.categories.accessibility?.score ?? 0) * 100),
        bestPractices: Math.round((lhr.categories['best-practices']?.score ?? 0) * 100),
        seo: Math.round((lhr.categories.seo?.score ?? 0) * 100),
      },
      cls,
    };
  } finally {
    await chrome.kill();
  }
}

async function main() {
  const results = [];
  for (const p of PATHS_TO_AUDIT) {
    console.log(`[lighthouse] auditing ${p}…`);
    results.push(await runOne(p));
  }

  if (REWRITE_BASELINE) {
    fs.writeFileSync(
      BASELINE_PATH,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          categoryDeltaCap: CATEGORY_DELTA_CAP,
          clsDeltaCap: CLS_DELTA_CAP,
          baseUrl: BASE_URL,
          runs: results.map((r) => ({ path: new URL(r.url).pathname, scores: r.scores, cls: r.cls })),
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`[lighthouse] baseline rewritten at ${path.basename(BASELINE_PATH)}`);
    return;
  }

  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(`[lighthouse] no baseline at ${BASELINE_PATH}. Run with --baseline first.`);
    process.exit(3);
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));

  for (const r of results) {
    const pth = new URL(r.url).pathname;
    if (!baseline.runs.some((x) => x.path === pth)) {
      console.log(`[lighthouse] no baseline for ${pth} — recording as new`);
    }
  }

  // Regression-only gate (G-11): improvements never fail; see lighthouse-delta.js.
  const failures = findFailures(results, baseline, {
    categoryDeltaCap: CATEGORY_DELTA_CAP,
    clsDeltaCap: CLS_DELTA_CAP,
  });

  if (failures.length > 0) {
    console.error('\n[lighthouse] FAIL — these regressions exceeded the cap:');
    for (const f of failures) {
      console.error(`  ${f.path} ${f.category}: ${f.prior} → ${f.current} (Δ ${f.delta})`);
    }
    process.exit(1);
  }
  console.log(`[lighthouse] OK — no category regressed > ${CATEGORY_DELTA_CAP} points, CLS within ${CLS_DELTA_CAP}`);
}

main().catch((err) => {
  console.error('[lighthouse] error:', err.message);
  process.exit(2);
});
