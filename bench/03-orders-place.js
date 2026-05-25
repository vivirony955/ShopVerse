// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * 03 — Orders place (multi-table TX, hottest financial path).
 *
 * Endpoint: POST /api/orders
 * Auth:     JWT (regular user)
 * Why hot: order placement involves cart consume, inventory reserve→commit,
 *          coupon validation, optional wallet debit, payment intent
 *          creation, and tracking event — single biggest transaction in
 *          the system.
 *
 * Expected p95 (local dev box): < 250 ms
 * Expected error rate: < 5% (legitimate 400s when stock runs out under
 *          concurrent load; reservation conditional updates surface this
 *          as 400 not 500).
 *
 * Prerequisite: seeded address + cart item + variant with stock.
 *
 * Run: k6 run 03-orders-place.js
 *      K6_VUS=50 K6_DURATION=1m k6 run 03-orders-place.js   # lighter
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import {
  BASE_URL,
  stages,
  httpDurationThresholds,
} from './lib/thresholds.js';
import { loginAsUser, authHeaders } from './lib/auth.js';

export const options = {
  // Order-place is heavier than read paths — cap at lower VU count by default.
  stages: stages.map((s) => ({ ...s, target: Math.min(s.target, 50) })),
  thresholds: httpDurationThresholds(250),
};

let cachedAddressId = null;
let cachedReservationId = null;

function ensureSetup(token) {
  // 1. Ensure address (idempotent if user reused).
  if (cachedAddressId === null) {
    const addrRes = http.post(
      `${BASE_URL}/api/users/me/addresses`,
      JSON.stringify({
        fullName: 'Bench User',
        phone: '9876543210',
        line1: '1 Bench Street',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
        isDefault: true,
      }),
      { headers: authHeaders(token), tags: { phase: 'setup' } },
    );
    if (addrRes.status === 201 || addrRes.status === 200) {
      try {
        cachedAddressId = addrRes.json().id;
      } catch {
        cachedAddressId = 1;
      }
    } else {
      cachedAddressId = 1;
    }
  }

  // 2. Create a fresh reservation per iteration — orders consume reservations.
  const resvRes = http.post(
    `${BASE_URL}/api/cart/reservation`,
    null,
    { headers: authHeaders(token), tags: { phase: 'setup' } },
  );
  if (resvRes.status === 201 || resvRes.status === 200) {
    try {
      cachedReservationId = resvRes.json().reservationId ?? resvRes.json().id;
    } catch {
      cachedReservationId = null;
    }
  }
}

export default function () {
  const token = loginAsUser();
  if (!token) return;
  ensureSetup(token);
  if (!cachedAddressId || !cachedReservationId) return;

  const res = http.post(
    `${BASE_URL}/api/orders`,
    JSON.stringify({
      addressId: cachedAddressId,
      reservationId: cachedReservationId,
    }),
    {
      headers: authHeaders(token),
      tags: { name: '/api/orders' },
    },
  );
  check(res, {
    'placed or expected 4xx': (r) =>
      r.status === 201 || (r.status >= 400 && r.status < 500),
  });

  // After a successful place, the reservation is consumed → reset for next iter.
  if (res.status === 201) cachedReservationId = null;

  sleep(Math.random() * 0.5);
}
