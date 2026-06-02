// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * Shared k6 stage + threshold definitions.
 *
 * Threshold conventions:
 *   - `http_req_failed` < 1%   — anything higher means the server is
 *      overwhelmed or there's a real bug. Always enforced.
 *   - `http_req_duration p(95)` is per-script: hot reads under 100ms,
 *      writes under 250ms. Each script sets its own number via
 *      `httpDurationThresholds(p95)`.
 *
 * Stage defaults follow a warmup → ramp → steady → cool-down shape
 * documented in bench/README.md. Override via env vars at run time:
 *
 *   K6_VUS=20 K6_DURATION=1m k6 run 01-products-list.js
 *
 * `K6_VUS` controls the peak; `K6_DURATION` controls the steady-state
 * length. The warmup + ramp + cool-down phases are fixed.
 */

const PEAK_VUS = Number(__ENV.K6_VUS ?? 100);
const STEADY = String(__ENV.K6_DURATION ?? '2m');

export const stages = [
  { duration: '30s', target: Math.max(5, Math.floor(PEAK_VUS / 10)) }, // warmup
  { duration: '1m', target: PEAK_VUS },                                 // ramp-up
  { duration: STEADY, target: PEAK_VUS },                               // steady
  { duration: '30s', target: 0 },                                       // ramp-down
];

/**
 * Standard threshold set. Pass the per-script p95 SLO in milliseconds.
 *
 * Example:
 *   thresholds: httpDurationThresholds(80),
 */
export function httpDurationThresholds(p95Ms) {
  return {
    http_req_failed: ['rate<0.01'],
    http_req_duration: [`p(95)<${p95Ms}`],
  };
}

/** Default base URL — overrideable via BASE_URL env var. */
export const BASE_URL =
  (__ENV.BASE_URL ?? 'http://localhost:4000').replace(/\/+$/, '');
