// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * 01 — Products list (PLP browsing).
 *
 * Endpoint: GET /api/products
 * Auth:     none (public)
 * Why hot: every catalog page hits this; cached but high QPS.
 *
 * Expected p95 (local dev box, postgres in docker): < 80 ms
 * Expected error rate: < 0.5%
 *
 * Run: k6 run 01-products-list.js
 *      K6_VUS=200 K6_DURATION=5m k6 run 01-products-list.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import {
  BASE_URL,
  stages,
  httpDurationThresholds,
} from './lib/thresholds.js';

export const options = {
  stages,
  thresholds: httpDurationThresholds(80),
};

export default function () {
  // Mix of plain list, filtered, paginated. Mirrors real catalog traffic.
  const variants = [
    `${BASE_URL}/api/products`,
    `${BASE_URL}/api/products?page=2&limit=20`,
    `${BASE_URL}/api/products?minPrice=500&maxPrice=2000`,
    `${BASE_URL}/api/products?sort=basePrice&order=asc`,
  ];
  const url = variants[Math.floor(Math.random() * variants.length)];

  const res = http.get(url, { tags: { name: '/api/products' } });
  check(res, {
    '200 ok': (r) => r.status === 200,
    'has products array': (r) => {
      try {
        const body = r.json();
        return Array.isArray(body) || Array.isArray(body.products);
      } catch {
        return false;
      }
    },
  });

  // Pace requests — real users don't hammer at line speed.
  sleep(Math.random() * 0.5);
}
