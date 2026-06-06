// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

// Pure (side-effect-free) Lighthouse delta comparison so it can be unit-tested
// independently of check-lighthouse.js (which spawns Chromium + reads files).
//
// G-11: category scores are gated REGRESSION-ONLY. A score that DROPS more than
// the cap below the baseline fails; an IMPROVEMENT (higher score) must never
// fail the gate — the previous symmetric `Math.abs` check failed CI when scores
// got better, which is wrong for a "higher is better" metric. CLS was already
// one-way (a higher/worse CLS than baseline fails).

const CATEGORIES = ['performance', 'accessibility', 'bestPractices', 'seo'];

/**
 * @param {Array<{url:string, scores:Record<string,number>, cls:number}>} results
 * @param {{runs: Array<{path:string, scores:Record<string,number>, cls:number}>}} baseline
 * @param {{categoryDeltaCap?:number, clsDeltaCap?:number}} [opts]
 * @returns {Array<{path:string, category:string, prior:number, current:number, delta:number}>}
 */
function findFailures(results, baseline, opts = {}) {
  const categoryDeltaCap = opts.categoryDeltaCap ?? 3;
  const clsDeltaCap = opts.clsDeltaCap ?? 0.02;
  const failures = [];

  for (const r of results) {
    const pth = new URL(r.url).pathname;
    const priorRun = baseline.runs.find((x) => x.path === pth);
    if (!priorRun) continue; // new path — caller logs it; not a failure

    for (const cat of CATEGORIES) {
      // Regression = how far the score dropped BELOW the baseline. Improvements
      // (negative regression) never fail.
      const regression = priorRun.scores[cat] - r.scores[cat];
      if (regression > categoryDeltaCap) {
        failures.push({
          path: pth,
          category: cat,
          prior: priorRun.scores[cat],
          current: r.scores[cat],
          delta: r.scores[cat] - priorRun.scores[cat],
        });
      }
    }

    // CLS: lower is better, so only an INCREASE beyond the cap fails.
    const clsDelta = r.cls - priorRun.cls;
    if (clsDelta > clsDeltaCap) {
      failures.push({
        path: pth,
        category: 'CLS',
        prior: priorRun.cls,
        current: r.cls,
        delta: clsDelta,
      });
    }
  }

  return failures;
}

module.exports = { findFailures, CATEGORIES };
