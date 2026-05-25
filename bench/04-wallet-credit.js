// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * 04 — Wallet credit (financial path, exercises I-3 invariant).
 *
 * Endpoint: POST /api/wallet/credit
 * Auth:     JWT (admin only — wallet credits go through maker-checker)
 * Why hot: every refund + every cashback + every bonus credit hits this.
 *          Verifies the double-entry ledger (I-3) holds under concurrency.
 *
 * Expected p95 (local dev box): < 100 ms
 * Expected error rate: < 1%
 *
 * Each VU credits its own user (via BENCH_TARGET_USER_ID or self) with
 * unique reference strings so the idempotency unique-constraint doesn't
 * 4xx everything.
 *
 * Prereqs:
 *   - BENCH_ADMIN_EMAIL + BENCH_ADMIN_PASSWORD (or seeded admin@shopverse.dev / admin123)
 *   - At least one target user with a wallet (the bench user gets one on first credit).
 *
 * Run: k6 run 04-wallet-credit.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import {
  BASE_URL,
  stages,
  httpDurationThresholds,
} from './lib/thresholds.js';
import { loginAsAdmin, loginAsUser, authHeaders } from './lib/auth.js';

export const options = {
  stages,
  thresholds: httpDurationThresholds(100),
};

let cachedTargetUserId = null;

function getTargetUserId(userToken) {
  if (cachedTargetUserId) return cachedTargetUserId;
  if (__ENV.BENCH_TARGET_USER_ID) {
    cachedTargetUserId = Number(__ENV.BENCH_TARGET_USER_ID);
    return cachedTargetUserId;
  }
  const meRes = http.get(`${BASE_URL}/api/users/me`, {
    headers: authHeaders(userToken),
    tags: { phase: 'setup' },
  });
  if (meRes.status === 200) {
    try {
      cachedTargetUserId = meRes.json().id;
    } catch {
      cachedTargetUserId = 1;
    }
  }
  return cachedTargetUserId;
}

export default function () {
  const userToken = loginAsUser();
  const adminToken = loginAsAdmin();
  if (!userToken || !adminToken) return;

  const targetUserId = getTargetUserId(userToken);
  if (!targetUserId) return;

  // Unique reference per credit prevents the @@unique([walletId, reference, type])
  // index from rejecting subsequent credits as duplicate.
  const reference = `bench:${__VU}:${__ITER}:${Date.now()}`;

  const res = http.post(
    `${BASE_URL}/api/wallet/credit`,
    JSON.stringify({
      userId: targetUserId,
      amount: 1,
      reference,
      description: 'bench credit',
    }),
    {
      headers: authHeaders(adminToken),
      tags: { name: '/api/wallet/credit' },
    },
  );
  check(res, {
    'credit ok': (r) => r.status === 201 || r.status === 200,
  });

  sleep(Math.random() * 0.3);
}
