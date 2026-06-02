// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * k6 auth helper.
 *
 * On first call per VU, registers a unique user (if BENCH_REUSE_USER is not
 * set) and logs in, caching the JWT in a per-VU module-scoped variable.
 * Subsequent calls return the cached token — no thundering-herd on /auth.
 *
 * For admin-only endpoints (wallet credit, etc.), set BENCH_ADMIN_EMAIL +
 * BENCH_ADMIN_PASSWORD and call `loginAsAdmin()` instead.
 */

import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from './thresholds.js';

let cachedUserToken = null;
let cachedAdminToken = null;

export function loginAsUser() {
  if (cachedUserToken) return cachedUserToken;

  // Each VU gets its own email so concurrent registrations don't collide
  // on the email-unique constraint.
  const email =
    __ENV.BENCH_REUSE_USER ??
    `bench-vu-${__VU}-${Date.now()}@bench.shopverse.test`;
  const password = 'Bench@1234';

  // Try register (may 409 if reused). Ignore the response; login resolves both.
  http.post(
    `${BASE_URL}/api/auth/register`,
    JSON.stringify({
      email,
      password,
      firstName: 'Bench',
      lastName: 'User',
    }),
    { headers: { 'content-type': 'application/json' }, tags: { phase: 'setup' } },
  );

  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'content-type': 'application/json' }, tags: { phase: 'setup' } },
  );
  check(loginRes, { 'login ok': (r) => r.status === 200 });

  const body = loginRes.json();
  cachedUserToken = body && body.access_token;
  return cachedUserToken;
}

export function loginAsAdmin() {
  if (cachedAdminToken) return cachedAdminToken;

  const email = __ENV.BENCH_ADMIN_EMAIL ?? 'admin@shopverse.dev';
  const password = __ENV.BENCH_ADMIN_PASSWORD ?? 'admin123';

  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'content-type': 'application/json' }, tags: { phase: 'setup' } },
  );
  check(loginRes, {
    'admin login ok': (r) => r.status === 200,
  });

  const body = loginRes.json();
  cachedAdminToken = body && body.access_token;
  return cachedAdminToken;
}

/** Headers helper: adds bearer token to a base headers object. */
export function authHeaders(token, extra = {}) {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
    ...extra,
  };
}
