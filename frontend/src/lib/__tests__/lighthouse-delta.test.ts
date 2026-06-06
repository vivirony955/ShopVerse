// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

// The gate is a plain CommonJS node script (no TS build), so require() it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { findFailures } = require("../../../scripts/lighthouse-delta");

type Scores = { performance: number; accessibility: number; bestPractices: number; seo: number };
type Failure = { path: string; category: string; prior: number; current: number; delta: number };

describe("lighthouse delta gate — regression-only (G-11 / T-9)", () => {
  const baseline = {
    runs: [
      {
        path: "/products",
        scores: { performance: 90, accessibility: 95, bestPractices: 95, seo: 100 },
        cls: 0.05,
      },
    ],
  };
  const opts = { categoryDeltaCap: 3, clsDeltaCap: 0.02 };
  const base: Scores = { performance: 90, accessibility: 95, bestPractices: 95, seo: 100 };

  const run = (scores: Scores, cls = 0.05): Failure[] =>
    findFailures([{ url: "http://x/products", scores, cls }], baseline, opts);

  it("passes when scores match the baseline", () => {
    expect(run(base)).toEqual([]);
  });

  it("does NOT fail when a score IMPROVES beyond the cap (the old Math.abs bug)", () => {
    expect(run({ performance: 99, accessibility: 100, bestPractices: 100, seo: 100 })).toEqual([]);
  });

  it("fails when a score REGRESSES more than the cap", () => {
    const f = run({ ...base, performance: 80 });
    expect(f).toHaveLength(1);
    expect(f[0].category).toBe("performance");
  });

  it("tolerates a regression within the cap", () => {
    expect(run({ ...base, performance: 88 })).toEqual([]); // -2, within 3
  });

  it("fails on a CLS increase beyond the cap (one-way)", () => {
    expect(run(base, 0.1)).toHaveLength(1);
  });

  it("passes when CLS improves", () => {
    expect(run(base, 0.01)).toEqual([]);
  });

  it("skips paths absent from the baseline (not a failure)", () => {
    const f: Failure[] = findFailures(
      [{ url: "http://x/unknown", scores: base, cls: 0.05 }],
      baseline,
      opts,
    );
    expect(f).toEqual([]);
  });
});
