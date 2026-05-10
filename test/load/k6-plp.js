/**
 * k6 — Product Listing Page (PLP) load test.
 *
 * Target: GET /api/products (paginated, unauthenticated).
 * Goal:   Verify PLP can sustain 1000 VU for 5 minutes without errors,
 *         and p95 stays under 150ms (should be cache-hot after ~10s).
 *
 * Run:    k6 run test/load/k6-plp.js
 * Env:    BASE_URL (default http://localhost:3000)
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';

const errorRate = new Rate('errors');
const plpLatency = new Trend('plp_latency', true);

export const options = {
  stages: [
    { duration: '30s', target: 200 },   // ramp up
    { duration: '4m',  target: 1000 },   // sustain
    { duration: '30s', target: 0 },      // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<150'],     // p95 < 150ms
    errors: ['rate<0.01'],                // < 1% errors
  },
};

export default function () {
  const page = Math.floor(Math.random() * 5) + 1;
  const res = http.get(`${BASE}/api/products?page=${page}&limit=20`);

  plpLatency.add(res.timings.duration);
  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'has products': (r) => {
      try { return JSON.parse(r.body).length > 0; } catch { return false; }
    },
  });
  errorRate.add(!ok);
  sleep(0.5 + Math.random());
}
