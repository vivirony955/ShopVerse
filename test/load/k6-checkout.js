/**
 * k6 — Full checkout flow load test.
 *
 * Flow per VU iteration:
 *   1. Register a unique user (POST /api/auth/register)
 *   2. Login to get JWT (POST /api/auth/login)
 *   3. Add item to cart (POST /api/cart/items)
 *   4. Reserve cart (POST /api/cart/reserve)
 *   5. Place order (POST /api/orders)
 *
 * Goal:   500 VU, 10 minutes. No oversell. Invariants hold post-run.
 *         p95 for the full flow < 2s.
 *
 * Setup:  Requires at least 1 product + variant with stock >= 5000
 *         pre-seeded in the database. Set VARIANT_ID and ADDRESS_ID
 *         via env vars, or create an address in setup().
 *
 * Run:    k6 run test/load/k6-checkout.js
 * Env:    BASE_URL, VARIANT_ID (required), ADMIN_TOKEN (optional for setup)
 */
import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const VARIANT_ID = parseInt(__ENV.VARIANT_ID || '0');
if (!VARIANT_ID) {
  console.error('VARIANT_ID env var is required');
}

const errorRate = new Rate('errors');
const checkoutLatency = new Trend('checkout_flow_latency', true);
const ordersPlaced = new Counter('orders_placed');
const stockRejections = new Counter('stock_rejections');

export const options = {
  stages: [
    { duration: '1m',  target: 100 },
    { duration: '8m',  target: 500 },
    { duration: '1m',  target: 0 },
  ],
  thresholds: {
    checkout_flow_latency: ['p(95)<2000'],
    errors: ['rate<0.05'],   // < 5% non-stock errors
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
  const email = `k6_${suffix}@loadtest.com`;
  const password = 'LoadTest@1234';
  const start = Date.now();

  // 1. Register
  let res = http.post(`${BASE}/api/auth/register`, JSON.stringify({
    email,
    password,
    firstName: 'Load',
    lastName: 'Test',
  }), { headers: { 'Content-Type': 'application/json' } });

  if (res.status !== 201) {
    errorRate.add(true);
    return;
  }

  // 2. Login
  res = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email, password }), {
    headers: { 'Content-Type': 'application/json' },
  });
  let body;
  try { body = JSON.parse(res.body); } catch { errorRate.add(true); return; }
  const token = body.access_token || body.accessToken;
  if (!token) { errorRate.add(true); return; }

  // 2b. Create address
  res = http.post(`${BASE}/api/users/addresses`, JSON.stringify({
    street: '123 Load St',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    phone: '9999999999',
  }), headers(token));
  let addr;
  try { addr = JSON.parse(res.body); } catch { errorRate.add(true); return; }
  const addressId = addr.id;
  if (!addressId) { errorRate.add(true); return; }

  // 3. Add to cart
  res = http.post(`${BASE}/api/cart/items`, JSON.stringify({
    variantId: VARIANT_ID,
    quantity: 1,
  }), headers(token));

  if (res.status !== 201 && res.status !== 200) {
    errorRate.add(true);
    return;
  }

  // 4. Reserve
  res = http.post(`${BASE}/api/cart/reserve`, '{}', headers(token));
  if (res.status === 400) {
    // Likely "Insufficient stock" — expected under contention.
    stockRejections.add(1);
    checkoutLatency.add(Date.now() - start);
    return;
  }
  let reservation;
  try { reservation = JSON.parse(res.body); } catch { errorRate.add(true); return; }
  const reservationId = reservation.reservationId;
  if (!reservationId) { errorRate.add(true); return; }

  // 5. Place order
  res = http.post(`${BASE}/api/orders`, JSON.stringify({
    addressId,
    reservationId,
  }), headers(token));

  if (res.status === 200 || res.status === 201) {
    ordersPlaced.add(1);
  } else if (res.status === 400) {
    // Expected: stock exhausted, reservation expired, etc.
    stockRejections.add(1);
  } else {
    errorRate.add(true);
  }

  checkoutLatency.add(Date.now() - start);
  sleep(0.2 + Math.random() * 0.5);
}
