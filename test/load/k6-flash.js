/**
 * k6 — Flash sale burst test.
 *
 * Simulates 2000 VUs hitting a 100-unit flash SKU over 60 seconds.
 * Exactly 100 reservations should succeed; the rest should get "Insufficient stock".
 * The Redis gate (if available) should absorb the thundering herd before
 * Postgres; if Redis is down, the Postgres conditional UPDATE is still
 * the authoritative guard.
 *
 * Post-run: connect to Postgres and verify:
 *   SELECT "reservedStock" FROM "Variant" WHERE id = VARIANT_ID;
 *   → must be exactly 100 (or = initial_reserved + 100)
 *
 * Setup:  Seed a flash sale product with stock=100, ensure flash_sale
 *         is active (startsAt <= now, endsAt >= now + 2 min).
 *         Set VARIANT_ID via env var.
 *
 * Run:    k6 run test/load/k6-flash.js
 * Env:    BASE_URL, VARIANT_ID (required)
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const VARIANT_ID = parseInt(__ENV.VARIANT_ID || '0');
if (!VARIANT_ID) {
  console.error('VARIANT_ID env var is required');
}

const errorRate = new Rate('errors');
const reserveOK = new Counter('reserve_success');
const reserveFail = new Counter('reserve_stock_exhausted');

export const options = {
  scenarios: {
    flash_burst: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s',  target: 2000 },  // near-instant ramp
        { duration: '55s', target: 2000 },   // sustain burst
      ],
    },
  },
  thresholds: {
    errors: ['rate<0.01'],
  },
};

function headers(token) {
  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
}

export default function () {
  const suffix = `${__VU}_${__ITER}_${Date.now()}`;
  const email = `flash_${suffix}@loadtest.com`;
  const password = 'Flash@1234';

  // Register + login
  let res = http.post(`${BASE}/api/auth/register`, JSON.stringify({
    email, password, firstName: 'Flash', lastName: 'Buyer',
  }), { headers: { 'Content-Type': 'application/json' } });
  if (res.status !== 201) { errorRate.add(true); return; }

  res = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email, password }), {
    headers: { 'Content-Type': 'application/json' },
  });
  let body;
  try { body = JSON.parse(res.body); } catch { errorRate.add(true); return; }
  const token = body.access_token || body.accessToken;
  if (!token) { errorRate.add(true); return; }

  // Add flash item to cart
  res = http.post(`${BASE}/api/cart/items`, JSON.stringify({
    variantId: VARIANT_ID,
    quantity: 1,
  }), headers(token));
  if (res.status !== 200 && res.status !== 201) { errorRate.add(true); return; }

  // Reserve — this is the hot path under contention
  res = http.post(`${BASE}/api/cart/reserve`, '{}', headers(token));
  if (res.status === 200 || res.status === 201) {
    reserveOK.add(1);
  } else if (res.status === 400) {
    reserveFail.add(1);
  } else {
    errorRate.add(true);
  }

  sleep(0.1);
}
