// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * 02 — Cart add (write path with conditional inventory reservation).
 *
 * Endpoint: POST /api/cart/items
 * Auth:     JWT (regular user)
 * Why hot: every PDP "add to cart" hits this. Goes through the
 *          reservation pipeline (conditional UPDATE with WHERE stock>0).
 *
 * Expected p95 (local dev box): < 150 ms
 * Expected error rate: < 1% (some 400s expected when stock runs out)
 *
 * Prerequisite: at least one variant with stock > number of VUs * iterations.
 *
 * Run: k6 run 02-cart-add.js
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
  thresholds: httpDurationThresholds(150),
};

// Pulled once per VU at setup-ish time. Picks the first variant from the
// catalog. Override with BENCH_VARIANT_ID to lock onto a specific variant.
function pickVariantId() {
  if (__ENV.BENCH_VARIANT_ID) return Number(__ENV.BENCH_VARIANT_ID);

  const listRes = http.get(`${BASE_URL}/api/products?limit=5`, {
    tags: { phase: 'setup' },
  });
  if (listRes.status !== 200) return 1;

  try {
    const body = listRes.json();
    const products = Array.isArray(body) ? body : body.products ?? [];
    for (const p of products) {
      if (p.variants && p.variants.length > 0) {
        return p.variants[0].id;
      }
    }
  } catch {
    // fall through
  }
  return 1;
}

let cachedVariantId = null;

export default function () {
  const token = loginAsUser();
  if (!token) return;
  if (cachedVariantId === null) cachedVariantId = pickVariantId();

  const res = http.post(
    `${BASE_URL}/api/cart/items`,
    JSON.stringify({ variantId: cachedVariantId, quantity: 1 }),
    {
      headers: authHeaders(token),
      tags: { name: '/api/cart/items' },
    },
  );
  check(res, {
    'ok or expected 4xx': (r) => r.status === 201 || (r.status >= 400 && r.status < 500),
  });

  sleep(Math.random() * 0.3);
}
