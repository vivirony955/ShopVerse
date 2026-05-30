# Post-W6 Remediation + Pipeline Modernization Plan

> Successor to the architecture-evolution programme (W1–W6) captured
> in `ARCH_EVOLUTION_TRACKER.md`. That programme is functionally
> complete; this document collects what remains and shapes it into
> phases an Opus session can pick up cold.
>
> **Status:** draft (pending review). Created from the session-26
> multi-persona audit response.
> **Last updated:** 2026-05-30.
> **Owner:** kernel team.
> **How to use:** scan §0 for context, then go to the phase whose
> trigger keywords match the current task. Each task has a self-
> contained context block so a fresh session can resume without
> prior conversation history.

---

## §0 — Context for any session picking this up

ShopVerse's W1–W6 plugin-architecture evolution delivered 95 of 97
plan items (`shopverse audit:completeness` reports 96/97 loose-
verified; the remaining T11 is blocked-on-human by plan §11.10
design).

Two pieces of unfinished work remain after W6 closeout:

1. **CI pipeline drift** — over W1–W6 the test surface grew
   substantially (1086 tests across 87 spec files) but the GitHub
   Actions workflows ran only the backend integration subset (714).
   Five test layers + three perf gates exist as scripts but
   nothing in CI exercises them.
2. **Deferred runtime activations** — k6 + Lighthouse gates ship
   self-skip semantics waiting on staging-URL provisioning;
   per-plugin attribution waits on operator decisions.

The user's stated next move: **make the pipeline sensible, then add
all testcases to it.** This plan is that — phase 1 first, then
the remediation items that surfaced during the audit.

### Personas

Tasks here are tagged with the lens(es) from `CLAUDE.md §D`:

| Persona | Owns | Cross-checks |
|---|---|---|
| **ARCHITECT** | structure, contracts, state machines | invariants, failure modes |
| **IMPLEMENTER** | file diffs, configuration | type safety, no broken callers |
| **AUDITOR** | code-vs-design-vs-schema drift | severity classification |
| **PERF_ENGINEER** | latency, contention, budgets | quantified numbers |
| **QA_ENGINEER** | happy + error + race + boundary | matrix coverage |
| **PRODUCT_OWNER** | shopper / operator flows | UX, error states |
| **DBA** | query plans, indexes, locks | rollback strategy |

A task lists its **primary persona** (executes) and **validator(s)**
(reviews the diff). When picking up a task, take on the primary
persona's mindset per CLAUDE.md §D.

### Status legend

Each task carries a status column:

- `pending` — not yet started
- `in_progress` — work started, not done
- `done` — code merged + verification gate green
- `deferred` — explicitly rolled forward; reason logged
- `blocked` — waiting on external input
- `dropped` — decided not to pursue; reason logged

---

## §1 — Phase 1: Pipeline modernization

**Goal:** the GitHub Actions pipeline runs every test layer + every
budget gate that exists in the repo, with sensible parallelism, no
duplicated install steps, and no silent-skip flake risks.

**Trigger keywords:** "pipeline", "CI", "GitHub Actions", "add tests
to CI", "workflow".

### §1.0 — Current state audit [AUDITOR]

**Jobs in `.github/workflows/ci.yml`:**
| Job | What it does | Test count |
|---|---|---|
| `typecheck` | `backend && tsc --noEmit` | 0 |
| `lint` | `backend && npm run lint` | 0 |
| `test` | `cd test && jest` (Postgres service) | 714 (now 720 with W6.T3 admin-plugins spec) |
| `schema` | `prisma validate` | 0 |
| `sbom` | CycloneDX SBOM | 0 |
| `helm-lint` | helm lint + kubeconform | 0 |
| `k8s-validate` | envsubst + kubeconform | 0 |
| `sentry-release` | upload sourcemaps (main only) | 0 |

**Jobs in `.github/workflows/frontend-budget.yml`:**
| Job | What it does |
|---|---|
| `bundle-size` | `frontend && bundle:check` |
| `lighthouse` | self-skip; activates with `LIGHTHOUSE_BASE_URL` |
| `a11y` | `frontend && npm test` (2 jest-axe tests) |
| (inline) | `hydration:check` (in bundle-size job) |
| (inline) | `plugin-memory:check` (in bundle-size job) |

**Jobs in `.github/workflows/bench-regression.yml`:**
| Job | What it does |
|---|---|
| `k6-bench` | self-skip; activates with `BENCH_BASE_URL` |

**Jobs MISSING entirely from CI:**

| Layer | Tests | Currently runs |
|---|---|---|
| `packages/sdk` Jest | 66 | local only |
| `packages/cli` Jest | 25 | local only |
| `packages/eslint-plugin-shopverse` Jest | 32 | local only |
| `packages/create-shopverse-plugin` Jest | 9 | local only |
| Frontend tsc | n/a (typecheck) | local only |
| Frontend lint (next lint) | n/a | local only |
| Frontend Playwright e2e | 222 | local only (needs running stack) |

**Total CI test count today:** 720 of 1086 → **66.5% coverage**.
**Target:** ≥ 90% coverage (the deferred Playwright suite alone is
20% of the gap; it activates with staging URL).

### §1.1 — Add the 4 package Jest suites [QA_ENGINEER + IMPLEMENTER]

- **Status:** pending
- **Effort:** 60 min
- **Risk:** L
- **Trigger:** "add SDK / CLI / lint / scaffolder tests to CI"
- **Why it matters:** 132 tests pass locally; if a regression breaks them on main, no one notices until next manual run. The shipped W6.T12 audit script also exits non-zero on a broken `packages/cli` → silent gap.
- **Current state:** Each package has its own `jest.config.js` (or jest.config.ts for sdk) + spec files. `npm test` in each works. No CI job invokes any of them.
- **Target state:** Single new workflow `.github/workflows/packages.yml` with four parallel jobs (`sdk`, `cli`, `eslint-plugin`, `create-plugin`), each running `npm ci && npm test` in its package dir.
- **Steps:**
  1. (IMPLEMENTER) New file `.github/workflows/packages.yml` modelled after `frontend-budget.yml`. Four parallel jobs, each:
     ```yaml
     - uses: actions/checkout@v4
     - uses: actions/setup-node@v4 (node-version 20, cache-dependency-path: packages/<pkg>/package-lock.json)
     - run: cd packages/<pkg> && npm ci && npm test
     ```
  2. (IMPLEMENTER) Each job should run `npm run build` first if the package has TS sources (cli + sdk-frontend + create-shopverse-plugin); the eslint-plugin builds via `tsc` too.
  3. (QA) Verify all 4 jobs pass on the current main commit.
  4. (QA) Add to branch protection rules: require all 4 to pass before merge to main.
- **Verification:**
  - [ ] CI workflow runs on PR + push to main
  - [ ] All 4 jobs report green
  - [ ] Synthetic regression (rename a function in `packages/sdk/src/runtime/semaphore.ts`) fails the sdk job
- **Rollback:** delete `packages.yml`; remove branch protection rule.
- **Dependencies:** none.

### §1.2 — Add frontend tsc + lint + a11y to CI [QA_ENGINEER + IMPLEMENTER]

- **Status:** pending
- **Effort:** 45 min
- **Risk:** L
- **Trigger:** "frontend CI", "add tsc/lint to frontend pipeline"
- **Why it matters:** Frontend tsc and `next lint` are operator-discipline today; a `'use client'` typo or a broken slot import would only surface in `next build`. Frontend Jest a11y (2 tests) ran W5.T5 and isn't in CI either, despite the W5.T5 commit message claiming it would be.
- **Current state:** `frontend-budget.yml` runs `bundle:check` which transitively does `next build` (catches type errors as build failures). But this is incidental — there's no dedicated tsc / lint job. The 2 jest-axe tests run via `npm test` in the `a11y` job. ESLint check (`next lint`) is not invoked anywhere.
- **Target state:** Extend `frontend-budget.yml` (rename to `frontend.yml`) with two new jobs: `typecheck` and `lint`. Move the existing `a11y` job to use a clearer name (`unit-tests`).
- **Steps:**
  1. (IMPLEMENTER) Rename file to `frontend.yml` (drop the budget-only framing).
  2. (IMPLEMENTER) Add `typecheck` job: install + `npx tsc --noEmit`.
  3. (IMPLEMENTER) Add `lint` job: install + `npm run lint -- --max-warnings=0`.
  4. (IMPLEMENTER) Rename `a11y` job to `unit-tests` and broaden its description (it'll grow as more frontend Jest tests land).
  5. (QA) Add all 3 to branch protection.
- **Verification:**
  - [ ] PR introducing a TS error in `frontend/src/lib/slots.ts` fails `typecheck`
  - [ ] PR introducing an ESLint warning fails `lint`
  - [ ] PR introducing an axe violation fails `unit-tests`
- **Rollback:** revert renames + remove the two new jobs.

### §1.3 — Consolidate the SDK build step [IMPLEMENTER + ARCHITECT]

- **Status:** pending
- **Effort:** 30 min
- **Risk:** L (DRY refactor)
- **Trigger:** "DRY CI", "consolidate workflows"
- **Why it matters:** `typecheck`, `lint`, and `test` in `ci.yml` each contain identical `Build SDK (file:../packages/sdk needs dist/ before backend install)` steps + identical `cd backend && npm ci`. Same in `frontend-budget.yml` and `packages.yml` once §1.1 lands. This burns ~30 s × 6 jobs ≈ 3 minutes per PR.
- **Current state:** 6+ duplicate step blocks in 3+ workflow files.
- **Target state:** Composite action `.github/actions/setup-sdk-and-backend` that does the npm-cache setup + SDK build + backend install in one step. Each job that needs it uses `- uses: ./.github/actions/setup-sdk-and-backend`.
- **Steps:**
  1. (ARCHITECT) Verify GitHub Actions composite-action syntax + cache key strategy (npm cache should key on backend's package-lock.json + the SDK's package-lock.json).
  2. (IMPLEMENTER) Create `.github/actions/setup-sdk-and-backend/action.yml` (composite type).
  3. (IMPLEMENTER) Replace the duplicated blocks in `ci.yml` + `packages.yml` + `frontend.yml`.
  4. (QA) Run a PR through the new pipeline; verify timing is faster.
- **Verification:**
  - [ ] PR build wall time decreased by at least 60 s
  - [ ] No job's behaviour changed (same green/red states)
- **Rollback:** revert workflow files; delete composite action.

### §1.4 — Run Playwright e2e in CI [QA_ENGINEER + IMPLEMENTER + PERF_ENGINEER]

- **Status:** deferred (paired with §4.1 staging URL provisioning)
- **Effort:** 90 min when unblocked
- **Risk:** M (e2e runs are slow + flaky if not isolated)
- **Trigger:** "Playwright in CI", "e2e CI"
- **Why it matters:** 222 e2e tests cover the entire shopper + admin journey. Today they're operator-run only. A regression in checkout flow could ship to main without anyone noticing until manual smoke.
- **Current state:** `frontend/playwright.config.ts` declares the project shape with `baseURL` env override + retry/screenshot/video on failure. `npm run test:e2e` runs locally against `localhost:3000` (frontend) + `localhost:4000` (backend).
- **Target state:** Two activation paths in CI:
  - **Stack-up path (slow):** new workflow `e2e.yml` that boots the backend + frontend via Docker compose, seeds the DB, then runs `npx playwright test`. Estimate 8–12 min wall time per PR; run on a CI-staging URL once §4.1 lands.
  - **Stack-down path (fast):** alternatively, the staging-URL path used by Lighthouse + k6: set `PLAYWRIGHT_BASE_URL` and run against staging.
- **Steps:**
  1. (ARCHITECT) Decide stack-up vs staging-URL. Staging-URL is cheaper per PR but waits on §4.1. Stack-up is self-contained but slow.
  2. (IMPLEMENTER + PERF) If stack-up: write a `docker-compose.ci.yml` that spins backend + frontend + Postgres + Redis. Add the playwright job. Cache `node_modules/.cache/Playwright/`.
  3. (IMPLEMENTER) If staging-URL: copy the W5.T10 Lighthouse pattern — read `PLAYWRIGHT_BASE_URL` from repo vars; self-skip when unset.
  4. (QA) Confirm the test sharding (the existing config has `workers: 1` — slow but stable; CI can override to `--workers=4` if pod has cores).
- **Verification:**
  - [ ] All 222 tests pass against the CI environment
  - [ ] Flaky tests (currently none documented) are identified and isolated
  - [ ] Total wall time < 15 min
- **Dependencies:** §4.1 (staging URL) for the cheap path; standalone for stack-up path.

### §1.5 — Pipeline status snapshot [AUDITOR]

- **Status:** pending (continuous; refresh quarterly)
- **Effort:** 20 min initial + 10 min refresh
- **Risk:** L
- **Trigger:** "CI audit", "pipeline status"
- **Why it matters:** A pipeline that grows organically drifts. A periodic snapshot keeps the documentation honest.
- **Target state:** `docs/ci-pipeline.md` — table of every workflow, what it gates, average wall time, and ownership.
- **Steps:**
  1. (AUDITOR) Enumerate workflows + jobs + their actual function.
  2. (IMPLEMENTER) Write `docs/ci-pipeline.md`.
  3. (AUDITOR) Set a calendar reminder for quarterly refresh.

---

## §2 — Phase 2: Test coverage closure

**Goal:** the gaps surfaced by the W6 multi-persona audit get
filled where executable; the rest is documented for staged-URL
activation.

**Trigger keywords:** "test gap", "missing test", "add integration
test".

### §2.1 — E2E test for `/admin/plugins` page [QA_ENGINEER]

- **Status:** deferred (pairs with §1.4)
- **Effort:** 60 min
- **Risk:** L
- **Trigger:** "admin/plugins e2e", "test admin page"
- **Why it matters:** W6.T3 shipped the page + backend integration tests (PLUG-H01..H04, PLUG-E01..E03). What's missing is the click-through e2e: admin logs in → navigates to /admin/plugins → sees the table → clicks Disable → toast appears → row shows Disabled → click Enable → row returns to Active.
- **Current state:** `frontend/e2e/admin.spec.ts` and `admin-extended.spec.ts` cover other admin surfaces; no test references `/admin/plugins`.
- **Target state:** `frontend/e2e/admin-plugins.spec.ts` with 3 tests:
  - admin sees the table, expected plugin count ≥ 5
  - admin clicks Disable on a plugin → row updates + toast
  - admin clicks Enable → row reverts
- **Steps:**
  1. (QA) Read existing `admin.spec.ts` to mirror the auth setup pattern.
  2. (IMPLEMENTER) Add the spec.
  3. (QA) Verify locally with `npm run test:e2e admin-plugins`.
- **Verification:** all 3 tests green; runs in CI once §1.4 + §4.1 land.
- **Dependencies:** §1.4 / §4.1.

### §2.2 — Real V8 heap snapshot harness (per-plugin) [PERF_ENGINEER]

- **Status:** dropped (gate already satisfied via proxy)
- **Effort:** 120 min if pursued
- **Risk:** M (orchestration heavy)
- **Trigger:** "real heap snapshot", "V8 RSS"
- **Why it matters:** Plan §5 #8 caps plugin idle memory at 10 MB. W6.T1 ships a raw-source-bytes proxy; the real check would be a child-process orchestrator that boots the kernel with one plugin at a time, measures RSS / heapUsed delta after 100 idle cycles.
- **Current state:** Proxy gate at `frontend/scripts/check-plugin-memory.js`. All 6 plugins comfortably under 1 MB raw bytes (max is price-alerts at 0.15 MB, mostly package-lock.json).
- **Why dropped:** the proxy passes by ~70×; building a real harness for headroom that nobody is approaching is yak-shaving. **Re-open if** any plugin actually trips the proxy gate.
- **Trigger to re-open:** PR that fails `npm run plugin-memory:check`.

### §2.3 — JSON-LD registry unit tests [QA_ENGINEER]

- **Status:** done (covered indirectly)
- **Effort:** 0
- **Trigger:** "jsonld-registry test"
- **Why it matters:** W5.T7's collision detection ran 8 ad-hoc assertions via `node --experimental-strip-types`. Strict Jest tests would have value.
- **Current state:** The rolled-forward W5.T1/T3/T7/T8 deferred test gates are conceptually closed by the iterate-all-slots a11y test (1 entry today exercises the slot wrapper end-to-end). If `jsonld-registry` ever fails, the slot smoke would catch it indirectly.
- **Why no action:** the cost (extending frontend Jest setup) is meaningfully higher than the regression risk (the registry is 90 LOC of pure functions). Re-open if a real bug surfaces.

### §2.4 — `@shopverse/sdk-frontend` `t()` tests [QA_ENGINEER]

- **Status:** dropped
- **Effort:** 0
- **Trigger:** "sdk-frontend test"
- **Why:** `t()` is a 1-line stub. Testing it is busywork. Re-open when `t()` gains locale resolution (future i18n wave).

---

## §3 — Phase 3: Flake remediation

**Goal:** the three latent flakes from W3/W4 are either fixed or
formally accepted as "known intermittent, low impact".

**Trigger keywords:** "flake", "PAY-E02", "CPN-D02", "DR-H01".

### §3.1 — CPN-D02 root-cause + fix [QA_ENGINEER + PERF_ENGINEER + DBA]

- **Status:** pending
- **Effort:** 60–120 min depending on root-cause depth
- **Risk:** M (touches concurrency + connection pooling)
- **Trigger:** "CPN-D02 flake", "concurrent coupon race"
- **Why it matters:** Cross-spec runs occasionally fail with "expected ≥ 1 succeed; got 0". Always passes in isolation. Hypothesis from W6 session-26 analysis: in-process EventBus dispatch + 3-connection test pool contention; two concurrent `placeOrder` calls each running 5 in-process subscriber DB queries can exceed the pool.
- **Current state:** `test/promotions-deep.spec.ts:402` test exists; flake intermittent across W4 cross-spec runs.
- **Target state:** flake closed via one of:
  - **Path A (DBA):** bump test `DATABASE_URL` `connection_limit` from 3 to 10. Cheap, doesn't change kernel behaviour, masks root cause.
  - **Path B (PERF):** batch event publishes after the HTTP response in `OrdersService.placeOrder`. Touches hot path; requires careful invariant review.
  - **Path C (QA):** capture a real failure trace by running the suite 10× in CI; only then pick A vs B.
- **Steps:**
  1. (QA) Add a CI matrix job that runs the integration suite 5× sequentially; capture the failure rate baseline.
  2. (QA) Add logging in `cart-reservation.service.ts` + `orders.service.ts` to surface connection-acquire latency when a placeOrder is in flight.
  3. (DBA + PERF) Once a real trace is captured, pick Path A or B.
- **Verification:** the spec passes in 10 consecutive cross-spec runs.
- **Risk note:** picking Path A without confirming root cause hides the issue rather than fixing it. Resist the temptation.

### §3.2 — PAY-E02 broader swallow audit [QA_ENGINEER + AUDITOR]

- **Status:** partial (W6 session 26 fixed Invoice + RefundApproval)
- **Effort:** 60 min
- **Risk:** L
- **Trigger:** "PAY-E02", "swallow .catch in tests"
- **Why it matters:** `test/helpers/db.ts` still has ~25 `.catch(() => {})` patterns on `deleteMany` calls. The Invoice + RefundApproval ones were the documented PAY-E02 root cause; the others MAY hide unrelated issues.
- **Current state:** 2 swallow patterns removed (`8009c38`); ~23 remain.
- **Target state:** Each remaining `.catch(() => {})` either:
  - **Removed** (the table always exists in current migrations); OR
  - **Replaced** with `.catch((err) => { if (err.code !== 'P2021') throw err; })` (Prisma P2021 = table missing — explicit + narrow); OR
  - **Documented** with a comment explaining what condition the swallow is intentionally absorbing.
- **Steps:**
  1. (AUDITOR) Identify which tables in the swallow list don't exist in the current squashed-baseline schema. Likely candidates: tables added Phase-2+ that aren't in older migration baselines.
  2. (QA) For each remaining swallow, decide between remove / narrow / document.
  3. (QA) Run the integration suite 10× after the change to confirm no new flake surfaces.
- **Verification:** suite passes 10× consecutively after the change.
- **Risk:** removing a swallow may surface a real but previously-masked failure. That's the goal — but the noise can stall the cleanup if not paced.

### §3.3 — DR-H01 monitoring closure [QA_ENGINEER]

- **Status:** monitored (not reproduced in 15+ runs)
- **Effort:** 0 (passive)
- **Trigger:** "DR-H01", "reservation pollution"
- **Why it matters:** Reservation pollution surfaced once in W3 session 13. Has NOT recurred across W3 sessions 14+, W4 sessions 19/20/22, W5/W6 work.
- **Target state:** close as "won't fix; not reproducible" after 5 more clean integration suite runs (i.e., after §1.4 lands and CI runs the suite consistently).
- **Suggested closure date:** end of Phase 1.

---

## §4 — Phase 4: Runtime gate activation

**Goal:** the perf + a11y + load gates that ship as scaffolds
(`self-skip when env var unset`) become real fails when activated.

**Trigger keywords:** "staging URL", "lighthouse activate", "k6
activate", "runtime gate".

### §4.1 — Staging URL provisioning [IMPLEMENTER + ARCHITECT + DBA]

- **Status:** pending (operator-side decision)
- **Effort:** 4–8 hours (infra heavy)
- **Risk:** M (touches deploy + DB seeding)
- **Trigger:** "provision staging", "deploy staging"
- **Why it matters:** Unlocks §1.4 + §4.2 + §4.3 + §2.1 — four CI gates and one e2e suite waiting on a reachable URL.
- **Current state:** No persistent staging environment. CI either uses ephemeral Postgres (integration tests) or self-skips (lighthouse / k6).
- **Target state:** A staging environment with:
  - Backend running, populated with a seeded catalog (≥ 50 products, ≥ 1 admin user, ≥ 1 warehouse, pincodes for the test catalog).
  - Frontend running, pointing at the backend.
  - Reachable from GitHub Actions runners.
  - Deterministic — automated re-seed on demand so Playwright + Lighthouse + k6 start from a known state.
  - Cost-controlled — running 24/7 is wasteful; consider spin-up-on-PR with a 30-min TTL.
- **Steps:**
  1. (ARCHITECT) Pick the hosting model: ephemeral (docker-compose stack on CI runner) vs persistent (Render/Fly.io/Railway/AWS). The k6 / Playwright tests need ~3 min runtime each — ephemeral may be the right move for cost.
  2. (DBA) Decide the seeded test database strategy. Options: pg_dump baseline restored on each run; or `prisma migrate deploy && tsx prisma/seed.ts`.
  3. (IMPLEMENTER) Set up the chosen hosting, provision secrets in GitHub.
  4. (IMPLEMENTER) Set repo variables `LIGHTHOUSE_BASE_URL`, `BENCH_BASE_URL`, `PLAYWRIGHT_BASE_URL`.
  5. (QA) Trigger the workflows; confirm green.
- **Verification:**
  - [ ] `npm run lighthouse:check` runs against staging + asserts the baseline
  - [ ] `node bench/check-regression.js` runs k6 against staging + asserts ≤ 5% p95 Δ
  - [ ] `npx playwright test` runs 222 tests against staging
- **Risk:** wrong hosting choice = ongoing infra cost. Ephemeral docker-compose is the cheap path; revisit if/when staging is also useful for manual QA.

### §4.2 — Lighthouse baseline capture + activation [PERF_ENGINEER + PRODUCT_OWNER]

- **Status:** blocked on §4.1
- **Effort:** 30 min (once §4.1 lands)
- **Trigger:** "lighthouse baseline", "activate Lighthouse"
- **Steps:**
  1. (PERF) `BENCH_BASE_URL=<staging> npm run lighthouse:baseline` → commits real scores.
  2. (PRODUCT) Sanity-check the scores against W5.T10 placeholder defaults (perf 85, a11y 95, BP 95, SEO 100, CLS 0.05). Real scores should be at or above these.
  3. (PERF) Verify the ± 3 / 0.02 deltas hold across 3 consecutive runs.
- **Verification:** `frontend/lighthouse-baseline.json` updated; CI gate exits 0.

### §4.3 — k6 baseline capture + activation [PERF_ENGINEER + DBA]

- **Status:** blocked on §4.1
- **Effort:** 30 min (once §4.1 lands)
- **Trigger:** "k6 baseline", "activate k6 gate"
- **Steps:**
  1. (PERF) `BENCH_BASE_URL=<staging> node bench/check-regression.js --baseline` → commits real numbers.
  2. (DBA) Cross-check the numbers against bench/README.md's "local dev" expectations.
  3. (PERF) Decide if 5% delta cap is appropriate or should be wider (test-stack noise).
- **Verification:** `bench/baseline.json` updated; CI gate exits 0.

### §4.4 — Metrics-bridge endpoint for `/admin/plugins` page [ARCHITECT + IMPLEMENTER]

- **Status:** pending
- **Effort:** 90 min
- **Risk:** L (additive)
- **Trigger:** "breaker state in admin page", "p95 in /admin/plugins"
- **Why it matters:** W6.T3 page renders load status + operator-disabled state. Plan §6 calls for breaker state + p95 latency too. The data lives in `/metrics` (Prometheus exposition format); the page reads JSON.
- **Current state:** Page rendering placeholder copy in the footer ("Breaker state + p95 from Prometheus is a follow-on once a metrics-bridge endpoint ships").
- **Target state:** New endpoint `GET /admin/plugins/runtime-metrics` returns:
  ```ts
  {
    [pluginId: string]: {
      breakerState: 'closed' | 'open' | 'half-open';
      lastFailureMs: number | null;
      hookP95Ms: number | null;
      eventP95Ms: number | null;
    }
  }
  ```
- **Steps:**
  1. (ARCHITECT) Decide the data source. Option A: in-process map maintained by HookRunner + EventDispatcher. Option B: parse Prometheus text format from `/metrics`. A is cheaper + lower-latency; B is more accurate at scale.
  2. (IMPLEMENTER) Add controller + service.
  3. (IMPLEMENTER) Extend the page to consume + render.
- **Verification:** admin page shows live breaker state + p95 for each plugin; integration test for the new endpoint.

---

## §5 — Phase 5: Quality of life

**Goal:** small accumulated tech-debt items the architecture
evolution didn't address but a tidy codebase wants.

**Trigger keywords:** "tech debt", "cleanup", "quality of life".

### §5.1 — SDK re-export sweep [ARCHITECT + IMPLEMENTER]

- **Status:** pending (continuous, low priority)
- **Effort:** 30–60 min per plugin
- **Risk:** L (renames only)
- **Trigger:** "SDK re-exports", "grandfathered imports"
- **Why it matters:** Plugins (price-alerts, blog, etc.) still import `PrismaService`, `EmailService`, `JwtAuthGuard` etc. from `../../../src/...` relative paths instead of through `@shopverse/sdk`. The `no-kernel-import` lint rule (W6.T5) has a grandfathered allow-list for these; retiring them shrinks the allow-list and brings plugins closer to the third-party convention.
- **Current state:** Allow-list patterns in `packages/eslint-plugin-shopverse/src/rules/no-kernel-import.ts`. Each first-party plugin uses 3–6 grandfathered imports.
- **Target state:** `@shopverse/sdk/nest` sub-export that re-exports the kernel surfaces plugins legitimately need:
  - `PrismaService` (the test-stub variant)
  - `HookRunner`
  - `EventBus`
  - `PluginCronRegistry`
  - `withCronMetric`
  - `JwtAuthGuard` + `RolesGuard` + `Roles` decorator + `CurrentUser`
- **Steps:**
  1. (ARCHITECT) Decide which kernel APIs are truly part of the contract vs implementation detail. Some (PrismaService) need the same instance to share the DI pool — re-export must point at the kernel's singleton, not a fresh class.
  2. (IMPLEMENTER) Add `@shopverse/sdk/nest` sub-entry.
  3. (IMPLEMENTER) Migrate one plugin at a time. Each migration shrinks the allow-list.
  4. (IMPLEMENTER) When the allow-list is empty, remove the entire `isGrandfathered` branch from the lint rule.
- **Verification:** `cd backend && npm run lint -- --max-warnings=0` passes after each plugin migration.

### §5.2 — pnpm workspaces migration [IMPLEMENTER + ARCHITECT]

- **Status:** pending
- **Effort:** 4–6 hours
- **Risk:** M (touches every package's install path)
- **Trigger:** "pnpm workspaces", "monorepo cleanup"
- **Why it matters:** The current `file:` deps and ad-hoc hoisting in `packages/sdk` + `packages/cli` + `packages/sdk-frontend` + `packages/eslint-plugin-shopverse` + `packages/create-shopverse-plugin` + `frontend` + `backend` work, but W5.T5 hit npm's hoisting quirks and W6.T5 hit the dual-Jest version situation. pnpm workspaces would unify versions + speed up CI installs.
- **Current state:** Each package has its own `package-lock.json`; 4 separate `npm ci` runs per CI job.
- **Target state:** Single `pnpm-workspace.yaml` at repo root; one `pnpm install` covers everything; consistent Jest version (29 or 30, decided once).
- **Steps:**
  1. (ARCHITECT) Decide Jest version (29 for stability or 30 for ESM tooling).
  2. (IMPLEMENTER) Add `pnpm-workspace.yaml` listing all `packages/*` + `backend` + `frontend` + `test`.
  3. (IMPLEMENTER) Replace `file:` deps with `workspace:*` references.
  4. (IMPLEMENTER) Rewrite CI workflows to use pnpm.
  5. (QA) Confirm all 1086 tests still pass.
- **Verification:** clean `git clone` + `pnpm install` + `pnpm test` works.
- **Risk:** Changing the install model can break the SDK's dual-publish story (we ship to npm separately from the monorepo install). Validate `npm pack --dry-run` from each publish-ready package still produces the right tarball.

### §5.3 — Test coverage report in CI [QA_ENGINEER + IMPLEMENTER]

- **Status:** pending
- **Effort:** 30 min
- **Risk:** L
- **Trigger:** "coverage in CI", "lcov"
- **Why it matters:** `docs/test-coverage.md` documents the v8 coverage flow; CI doesn't run it. A coverage badge + per-PR coverage diff would catch regressions where a refactor reduces coverage.
- **Steps:**
  1. (IMPLEMENTER) Add `npm run test:cov` to the integration test job.
  2. (IMPLEMENTER) Upload `lcov.info` to Codecov / Coveralls (or stash as artifact).
  3. (QA) Set a soft threshold (drop > 2% fails the gate).
- **Verification:** coverage report visible in PR; threshold enforced.

---

## §6 — Phase 6: Deferred product roadmap

**Goal:** items that are correctly out-of-scope for v1 but should be
captured so they don't get re-discovered every quarter.

These are NOT engineering tasks; they're roadmap inputs. PRODUCT_OWNER
owns the timing; ARCHITECT owns the eventual technical design.

| Item | Why deferred | Trigger to revisit |
|---|---|---|
| Multi-tenant | Plan §10 E14 — explicit single-tenant in v1. Storefront contracts + DB schema would change | Customer demand for "manage 3 stores with 1 login" pattern |
| Mobile app (React Native / Flutter) | Web responsive is sufficient for India market today | NPS drops on mobile-web checkout |
| Plugin marketplace UI | Docs-only catalog is sufficient for first-party + early third-party | Third-party plugin count > 10 |
| 0-to-store wizard | QUICKSTART is sufficient for technical operators | Pitch trying to compete with Shopify Basic on setup-speed |
| Theme economy | One Tailwind theme + slot extensions is sufficient | Conversion from "looks like ShopVerse" is a real loss |
| AI/LLM features (search, recommendations) | Outside the W1–W6 plugin model scope | Competitive pressure from Shopify's AI features (already shipping) |

---

## §7 — Self-critique (mandatory per CLAUDE.md §D.3)

What's likely to go wrong with this plan:

1. **Phase 1 is bigger than it looks.** Adding 4 package suites + frontend tsc/lint/jest + composite action + Playwright integration is potentially a full week of CI work. Sequencing matters: §1.1 → §1.2 → §1.3 → §1.4. Don't try to do all four in one PR.

2. **§1.4 Playwright is a flake risk.** Playwright in CI is notoriously flaky if not isolated well. The repo's `workers: 1` choice is conservative; in CI, expect 5–10% retry rate even on stable tests. Budget for one full cycle of test stabilization.

3. **§3.1 CPN-D02 fix may surface other races.** Adding logging + running 10× sequentially could find races we didn't know about. Time-box the investigation; if no signal after 60 min, default to Path A (bump connection limit) and document the masking decision.

4. **§4.1 staging URL is the highest-cost item.** It blocks 4 downstream tasks. Don't start §1.4 / §4.2 / §4.3 / §2.1 until §4.1 is decided. The hosting choice (ephemeral docker-compose vs persistent Render/Fly) is reversible but expensive to reverse — pick on cost first, ergonomics second.

5. **§5.2 pnpm migration is risky for SDK publish.** The npm-publish path for `@shopverse/sdk` + `@shopverse/sdk-frontend` is currently `npm pack --dry-run`. pnpm workspaces use `workspace:*` protocol which needs `pnpm publish` semantics. Validate the publish flow before committing.

6. **The "make pipeline more sensible" goal can become endless polish.** Set a sharp definition of done: "every test that exists in the repo runs in CI; no workflow takes > 15 min wall time; composite actions used wherever 3+ jobs duplicate setup." Stop when those three are met.

7. **Persona assignment is a heuristic, not a rule.** When two personas disagree on approach, the architect lens wins for design decisions; the QA lens wins for verification gates. Don't get stuck in role-play; the labels are scaffolding.

8. **§6 deferrals are tempting to pull forward.** Resist. The roadmap items are deferred for sound reasons (plan §10 E14 multi-tenant is explicitly out of v1 scope). Revisiting them mid-Phase-1 derails the actual work.

---

## §8 — Completion gates

### Phase 1 done when:
- [ ] `packages.yml` workflow exists; 4 jobs green
- [ ] `frontend.yml` (renamed) has typecheck + lint + unit-tests jobs
- [ ] Composite action `setup-sdk-and-backend` exists; duplicated steps removed
- [ ] `docs/ci-pipeline.md` shipped
- [ ] §1.4 Playwright either landed OR explicitly deferred to §4.1
- [ ] No CI job takes longer than 15 min
- [ ] All 4 package suites + frontend a11y included in branch protection

### Phase 2 done when:
- [ ] `frontend/e2e/admin-plugins.spec.ts` exists; runs against staging
- [ ] V8 heap harness: NOT pursued (proxy passes); re-open trigger documented
- [ ] Other dropped items: documented why

### Phase 3 done when:
- [ ] CPN-D02 either fixed (Path A or B) or formally accepted with reason
- [ ] PAY-E02 `.catch` audit complete; each surviving swallow documented
- [ ] DR-H01 closed-by-monitoring (5 more clean runs)

### Phase 4 done when:
- [ ] Staging URL provisioned
- [ ] Lighthouse baseline captured + gate active
- [ ] k6 baseline captured + gate active
- [ ] `/admin/plugins` page shows live breaker + p95

### Phase 5 done when:
- [ ] SDK re-export sweep complete; lint allow-list empty
- [ ] pnpm workspaces migration: done OR documented decision to stay
- [ ] CI coverage report wired

### Programme done when:
- All 5 phases above closed
- `shopverse audit:completeness` reports 97/97 verified (T11 closure
  via human user-test of `docs/plugins/tutorial.md`)

---

## §9 — Suggested execution order

Linear path an Opus session can follow:

1. **§1.0 audit** — read this section + run `ls .github/workflows/`.
   Confirm the table matches reality (it'll drift as we ship).
2. **§1.1 package suites in CI** — biggest immediate ROI; 132 tests
   gated.
3. **§1.2 frontend tsc + lint + jest** — second-biggest ROI.
4. **§1.3 composite action** — pure DRY refactor; high reward.
5. **§1.5 ci-pipeline.md** — snapshot the post-§1.1-1.3 state.
6. **§3.2 PAY-E02 broader cleanup** — finishes the session-26
   partial.
7. **§3.3 DR-H01 closure** — passive; tick it off once §1.1-1.3 land.
8. **§4.1 staging URL** — biggest cost; pick before starting any
   downstream work.
9. **§1.4 Playwright in CI** — depends on §4.1.
10. **§4.2 Lighthouse activation** — depends on §4.1.
11. **§4.3 k6 activation** — depends on §4.1.
12. **§2.1 admin/plugins e2e** — depends on §1.4.
13. **§4.4 metrics-bridge** — independent of staging.
14. **§3.1 CPN-D02** — only after §1.1-1.3 land (CI 5× run config).
15. **§5.1 SDK re-export sweep** — continuous; do one plugin per
    quiet day.
16. **§5.2 pnpm workspaces** — after §1.3 composite action (less
    rework).
17. **§5.3 coverage CI** — bundle with §1.1 if quick; defer
    otherwise.

**Estimated total effort** (engineering, excluding §4.1 infra):
~25 hours across 3-4 working days. The plan benefits substantially
from §4.1 happening early in parallel with §1.x.

---

## §10 — How this plan was written

Session 26 of the W1-W6 programme delivered the multi-persona audit
that surfaced these gaps (commit `ba147fe`). This document
formalizes those findings into actionable phases.

Each task in §1–§5 was triaged through 2-3 of the §D personas. The
suggested execution order is engineering-realistic, not aspirational
— the easy wins are front-loaded so the project sees throughput
before tackling §4.1's infra commitment.

If a future session disagrees with the prioritization, the §0
context + the per-task self-contained shape should let them
re-order freely. The shape is the contract; the order is a
suggestion.
