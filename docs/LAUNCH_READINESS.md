<!--
Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
See LICENSE in the project root for license information.
-->

# Launch Readiness

Build is complete (global core, region packs, SEO/DX/badge, telemetry, migration
tool, and the full enterprise capture layer in the private `shopverse-enterprise`
repo). What remains is hardening + the launch machinery. Items are categorized by
**who can unblock them**.

## ✅ Closed in this pass (engineering)

- **Capture loop wired** — the "Powered by ShopVerse" badge is now gated by the
  license **entitlements endpoint** (`/api/enterprise/entitlements`), not the old
  honour-system `NEXT_PUBLIC_HIDE_POWERED_BY` env flag. Community installs (no
  enterprise module) always show the badge; only a valid `WHITE_LABEL` license
  hides it. See `frontend/src/lib/entitlements.ts` + `Footer.tsx`.
- **De-India / config correctness** — admin high-value refund threshold is now
  configurable (`HIGH_VALUE_REFUND_THRESHOLD`, default 5000) with currency-neutral
  messages; `docs/plugins/i18n.md` updated to the real locale-aware `t()`.

## 🔴 Blockers — need YOU (accounts / infra / decisions)

These cannot be done in-repo; they gate launch.

| Item | Why it blocks |
|---|---|
| **Discovery: 10 customer calls + kill criteria** | The plan's validation gate — lock the beachhead + message before spend. |
| **Licensing provider account** (Keygen / LemonSqueezy) + **final pricing numbers** | Needed for a real buy→issue flow; fills the `PRICING.md` TBDs. |
| **Production infra** | Domain (`shopverse.dev`), hosting, managed Postgres + Redis, **Stripe live keys**, email provider, `JWT_SECRET`, `CORS_ORIGIN`. |
| **Telemetry collector live** | Stand up the sink at `telemetry.shopverse.dev`, or default telemetry to disabled until it exists — otherwise heartbeats POST to a dead URL. |
| **Back up the license private signing key** | `shopverse-enterprise/keys/license-signing.key` is local-only; losing it = rotate + re-issue all keys. |
| **Legal sign-off** | BSL terms, CLA bot enable, trademark / badge wording. |

## 🟡 Deferred — engineering fast-follow (I can do on request)

- **Live checkout → license issuance** (needs the provider account above).
- **Pricing page** (needs final numbers).
- **Perf live gates**: Lighthouse + k6 against a staging URL (budget *checks*
  via `next build` still run locally).
- **Real one-click-deploy boot** verification (`railway.json` / `render.yaml`).
- **e2e correctness polish**: seed `StoreSettings` in `e2e-seed.ts`; de-India the
  `frontend/e2e/pincode.spec.ts` literals (kept as-is now to avoid destabilizing
  the e2e suite pre-launch).
- **White-label branding application** in the storefront (apply `branding.*` from
  entitlements — today only `canHideBadge` is wired).
- **Scaffolder cleanup**: `create-shopverse-store` still writes the now-vestigial
  `NEXT_PUBLIC_HIDE_POWERED_BY`.
- **Enterprise repo**: SDK-plugin manifest wrapper, runnable purchase webhook,
  private-registry publish.
- **Live demo** instance + README demo GIF; Show HN / Product Hunt content.

## Security review — new Phase-4 surfaces (audit, this pass)

| Surface | Finding | Severity |
|---|---|---|
| Telemetry payload | Strict allowlist; PII-oracle test (`scrub()` is a no-op). No customer data. | ✅ none |
| Telemetry transport | Endpoint is operator-configured (default canonical); fire-and-forget, 4s timeout. Not an SSRF vector into the app. | ✅ none |
| Badge / entitlements | `canHideBadge` from a cryptographically verified license; branding is schema-validated (https URLs, hex colors, length) before any future render. | ✅ none |
| Payment-gateway plugins (S7) | Kernel Stripe path verifies its webhook signature. **Each regional gateway plugin must verify its own webhook signature** — enforce in the plugin checklist. | 🟡 guidance |
| Entitlements endpoint (enterprise repo) | Read-only; exposes the operator's own org name. Consider admin-gating if treated as sensitive. | 🟢 optional |

> CodeQL N/A (repo is on GitLab) — use GitLab SAST + secret scanning in CI instead.

## CI status (GitHub Actions mirror of `vivirony955/ShopVerse`)

- **Frontend workflow — FIXED.** The Bundle Size Budget gate's `next build` was
  failing to *compile* (`Cannot find module 'jest-axe'`), not exceeding a budget:
  `next build` type-checked the a11y test files, whose deps are root-hoisted and
  absent in the bundle/Docker contexts. Fix: exclude test files from the build
  `tsconfig.json` (so production `next build` never type-checks them) and add
  `tsconfig.tests.json` so the typecheck job still covers them. Verified locally:
  `bundle:check` / `hydration:check` / `plugin-memory:check` / lint / jest all green.

- **E2E Stack / prod Docker — FIXED + verified end-to-end with local Docker.** The
  prod image had never built or booted; several stacked pre-existing bugs, all now
  resolved (the `dist/src/` layout turned out to be self-consistent — every relative
  import + `resolvePluginModules` already expect it, so the runtime refs were the bug):
  1. `Dockerfile` now COPYs `backend/plugins.config.ts` + `backend/plugins/` so
     `nest build` compiles (was `Cannot find module '../plugins.config'`).
  2. `.dockerignore` excludes nested `**/node_modules` (plugin `file:` symlinks broke
     the build-context tar).
  3. Prod stage copies `prisma/schema` **before** `npm ci` (its postinstall runs
     `prisma generate`).
  4. Runtime paths aligned to the real `dist/src/` layout: Dockerfile CMD, package.json
     `start:prod`/`start:worker:prod`, helm/k8s/ansible args → `dist/src/main` (+`worker`);
     CI seed steps → `sh -c "cd backend && node dist/src/prisma/seed.js"` (exec runs from
     `/app`, app is at `/app/backend`).
  5. Health probes → `/api/health` (global prefix `api`; `/health` 404'd) and
     `127.0.0.1` instead of `localhost` (Next standalone binds IPv4 0.0.0.0; alpine
     `localhost`→IPv6 `::1` refused).
  Verified locally: both images build; backend boots with **all 8 plugins registered**
  (India GST TaxStrategy, hooks, crons) + healthy; frontend healthy; seeds run; smoke
  `/api/health` = `{"status":"ok"}`.
