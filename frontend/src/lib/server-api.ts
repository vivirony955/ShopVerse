// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * Server-only backend base URL (must include the `/api` global prefix).
 *
 * In containerized / split-host deployments the browser and the Next server
 * reach the backend at DIFFERENT hostnames — e.g. `http://localhost:3001/api`
 * from the browser (host port-mapping) vs `http://backend:3001/api` from
 * inside the frontend container (Docker network). `NEXT_PUBLIC_*` vars are
 * inlined at BUILD time, so a single one cannot carry both values.
 *
 * Server-side code (NextAuth `authorize`, SSR data/SEO fetches, the
 * entitlements probe) therefore reads a non-public, RUNTIME var
 * (`BACKEND_INTERNAL_URL`) first, then falls back to the public URL — correct
 * for dev and single-origin deploys where browser and server share an origin —
 * then the dev default.
 *
 * Browser-side code keeps reading `NEXT_PUBLIC_API_URL` directly (see
 * `src/lib/api.ts`); do NOT use this constant in client components.
 */
export const SERVER_API_BASE =
  process.env.BACKEND_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4000/api";
