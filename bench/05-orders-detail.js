// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * 05 — Orders detail (cached read, post-purchase polling).
 *
 * Endpoint: GET /api/orders/:id
 * Auth:     JWT (regular user)
 * Why hot: order-status pages poll this every 30s while shipment is in
 *          flight. Many concurrent customers.
 *
 * Expected p95 (local dev box): < 80 ms
 * Expected error rate: < 0.5%
 *
 * Prereq: an order belonging to the bench user. The script lists the
 * user's orders once at setup and rotates through them.
 *
 * Run: k6 run 05-orders-detail.js
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
  stages,
  thresholds: httpDurationThresholds(80),
};

let cachedOrderIds = null;

function getOrderIds(token) {
  if (cachedOrderIds) return cachedOrderIds;
  const res = http.get(`${BASE_URL}/api/orders`, {
    headers: authHeaders(token),
    tags: { phase: 'setup' },
  });
  if (res.status !== 200) {
    cachedOrderIds = [];
    return cachedOrderIds;
  }
  try {
    const body = res.json();
    const list = Array.isArray(body) ? body : body.orders ?? [];
    cachedOrderIds = list.map((o) => o.id).filter(Boolean);
  } catch {
    cachedOrderIds = [];
  }
  return cachedOrderIds;
}

export default function () {
  const token = loginAsUser();
  if (!token) return;
  const ids = getOrderIds(token);
  if (ids.length === 0) {
    // No orders to fetch — script can't run meaningfully against an empty user.
    sleep(1);
    return;
  }

  const id = ids[Math.floor(Math.random() * ids.length)];
  const res = http.get(`${BASE_URL}/api/orders/${id}`, {
    headers: authHeaders(token),
    tags: { name: '/api/orders/:id' },
  });
  check(res, {
    '200 ok': (r) => r.status === 200,
  });

  sleep(Math.random() * 0.3);
}
