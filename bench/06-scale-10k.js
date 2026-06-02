// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * 06 — Scale test: catalog browse at 10k concurrent users.
 *
 * Endpoint: GET /api/products (mix of list/filter/paginate, same as 01)
 * Auth:     none (public, but stresses Postgres + Redis cache + worker pool)
 * Why:      flash sale / homepage burst / SEO crawl spike — a single-region
 *           VPS at ~1k req/s steady (default 100 VUs) is normal; 10k VUs is
 *           an order of magnitude above and surfaces the hardware ceiling.
 *
 * Expected behaviour at 10k VUs:
 *   - p95 latency rises substantially (target: < 500 ms, not the 80 ms of
 *     the steady-state scenario).
 *   - Throughput plateaus around the Postgres connection-pool + node loop
 *     limit (~5k-10k req/s on a 4-core VPS).
 *   - Error rate budget loosened to < 2% — at saturation, the rate limiter
 *     and circuit breaker fire on purpose; some 429/503 is expected and
 *     correct.
 *
 * Run (LOCAL, only with sufficient resources):
 *   k6 run 06-scale-10k.js
 *
 * Run (DEDICATED runner — recommended for actual 10k):
 *   K6_VUS=10000 K6_DURATION=5m BASE_URL=https://prod.shopverse.in \
 *     k6 run 06-scale-10k.js
 *
 * ⚠️ Infrastructure requirements:
 *
 *   Generator side (where k6 runs):
 *     - ≥ 4 CPU cores, ≥ 8 GB RAM (k6 docs: ~30k VUs per 8-core machine)
 *     - Network: ≥ 100 Mbps sustained (10k VUs × ~1 req/s ≈ 10k req/s)
 *     - macOS / Linux only; Windows containers have ulimit issues at 10k+
 *
 *   Target side (the backend):
 *     - Production-grade Postgres (≥ 4 cores, connection_limit ≥ 200)
 *     - Redis available + warmed (PLP cache hit rate ≥ 80% expected)
 *     - Backend horizontally scaled OR vertically sized (≥ 8 cores)
 *     - Rate limiter + WAF disabled or tuned for the test source IP
 *
 *   For a real 10k+ test against staging, prefer k6 Cloud or a distributed
 *   runner (`k6 cloud run`) — a single-machine 10k generator is the upper
 *   bound of what's reliable.
 *
 * DO NOT run this against production without explicit operator approval
 * AND tuning the WAF / rate limiter / monitoring. 10k VUs sustained for
 * 5 min ≈ 1.5–3 million requests; without coordination this looks like
 * an attack.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL } from './lib/thresholds.js';

// Single-script override of the shared stage shape. We allow more warmup
// runway (1 min instead of 30 s) because at 10k VUs the connection pool
// needs longer to ramp without triggering false-positive errors.
const PEAK_VUS = Number(__ENV.K6_VUS ?? 10000);
const STEADY = String(__ENV.K6_DURATION ?? '5m');

export const options = {
  stages: [
    { duration: '1m', target: Math.max(50, Math.floor(PEAK_VUS / 20)) },  // warmup
    { duration: '2m', target: PEAK_VUS },                                  // ramp-up (slower than the 1 min default)
    { duration: STEADY, target: PEAK_VUS },                                // steady
    { duration: '1m', target: 0 },                                         // ramp-down
  ],
  thresholds: {
    // Loosened from the steady-state scenarios: at 10k VUs we accept
    // higher tail latency + non-zero error rate as long as the system
    // doesn't crash. The point is "does it stay UP at scale," not "is
    // it fast at scale."
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<500', 'p(99)<2000'],
  },
};

export default function () {
  // Same URL mix as 01-products-list — at 10k VUs the ONLY difference
  // is concurrency, so the same hot path gets exercised under saturation.
  const variants = [
    `${BASE_URL}/api/products`,
    `${BASE_URL}/api/products?page=2&limit=20`,
    `${BASE_URL}/api/products?minPrice=500&maxPrice=2000`,
    `${BASE_URL}/api/products?sort=basePrice&order=asc`,
  ];
  const url = variants[Math.floor(Math.random() * variants.length)];

  const res = http.get(url, {
    tags: { name: '/api/products', scenario: 'scale-10k' },
    // 10s timeout — at saturation some requests will queue. Better to
    // record a slow success than a misleading timeout.
    timeout: '10s',
  });

  check(res, {
    '2xx': (r) => r.status >= 200 && r.status < 300,
    // 429 / 503 are EXPECTED at saturation and not failures of the gate.
    // The check below classifies the response type for the summary.
    'rate-limited (expected at saturation)': (r) => r.status === 429,
  });

  // Wider pacing than 01 — at 10k VUs even small per-VU delay
  // significantly affects observed RPS. 0.5-1.5 s mimics human browsing.
  sleep(0.5 + Math.random());
}
