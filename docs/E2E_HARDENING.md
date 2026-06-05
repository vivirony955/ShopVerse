<!--
Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
See LICENSE in the project root for license information.
-->

# E2E Hardening — Tracker

Single source of truth for the e2e/Playwright hardening initiative. Born out of
the June-2026 prod-Docker e2e fix (commits `321a032`/`9b71a4a`): the suite went
green, but the run surfaced deep speed, reliability, and *coverage-honesty*
problems. This tracker is the plan to fix them.

> Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` dropped.
> Update the status box + add the commit SHA when a task lands. Delete this
> tracker once all phases are `[x]` (or fold remainders into the next tracker).

## Why (current state — measured, not guessed)

| Symptom | Measurement (215 tests / 24 specs) |
|---|---|
| Hardcoded sleeps dominate wall-clock | **240** `waitForTimeout` calls ≈ **526 s (~8.8 min)** of pure idle |
| Rate-limit workarounds (now dead) | `auth.spec.ts:37` `waitForTimeout(70000)` + `test.setTimeout(100_000)`; `auth-extended.spec.ts:83` `// space from A-05` (5 s) + 8 s |
| "Soft" tests — green even if feature broken | **238** `.catch(() => false)` · **90** `console.log("…skipped/not found")` · **44** `toBeTruthy` |
| Root cause of soft tests | `e2e-seed.ts` seeds only users + categories + 5 products — no txns/reviews/tickets/orders to assert against |
| Serial + fragile | `workers: 1`, `fullyParallel: false`; one `setup-*` flake marked **78 tests "did not run"** (headline said "1 failed") |
| Perf gates not real | Lighthouse vs a `"PLACEHOLDER"` baseline w/ symmetric `Math.abs(±3)` (fails on improvement); both Lighthouse + k6 currently `continue-on-error` |

## Targets (definition of done)

- **Runtime**: full Playwright run ≤ **8 min** wall-clock (from ~20), ideally ≤ 5 with sharding.
- **Flake**: zero timing-coupled flake; setup never cascades (a setup failure fails *only* its own project's tests, surfaced clearly).
- **Honesty**: ≤ 20 intentionally-tolerant tests remain; every "feature exists" test backed by deterministic seed data.
- **Perf**: Lighthouse + k6 are *blocking* against a CI-representative baseline (no `continue-on-error`).

---

## Phase 0 — Quick wins (XS/M effort, do first)

Unblocked by the rate-limit fix (`AUTH_THROTTLE_LIMIT=1000` in CI). No seed/structure changes.

| ID | Task | Files | Acceptance | Status |
|---|---|---|---|---|
| EH-0.1 | Delete dead rate-limit sleeps | `auth.spec.ts:34-37` (70 s + `setTimeout`), `auth-extended.spec.ts:51,83` ("space from"/avoid-rate-limit) | specs pass without the sleeps; ~1.5 min reclaimed | `[ ]` |
| EH-0.2 | `waitForTimeout` → web-first assertions, auth specs | `auth.spec.ts`, `auth-extended.spec.ts` | no `waitForTimeout` for *state* waits (only legitimate debounce waits, commented); green | `[ ]` |
| EH-0.3 | `waitForTimeout` → web-first, remaining specs (spec-by-spec) | all `e2e/*.spec.ts` (240 sites) | `grep -c waitForTimeout` ≤ 20 (each survivor justified by a comment) | `[ ]` |
| EH-0.4 | Lower `loginAs` brittleness | `e2e/helpers.ts:25` | wait on a post-login signal (e.g. account control / `storageState` cookie), not just `waitForURL`-until-load | `[ ]` |

## Phase 1 — Coverage honesty (M effort, highest quality ROI)

Seed deterministic fixtures so soft `.catch(()=>false)` tests become real assertions.

| ID | Task | Files | Acceptance | Status |
|---|---|---|---|---|
| EH-1.1 | Seed `StoreSettings` (currency/locale/caps) | `backend/src/prisma/e2e-seed.ts`; model `StoreSettings` (schema:154) | settings row exists; storefront currency assertions can be exact | `[ ]` |
| EH-1.2 | Seed a wallet + `WalletTransaction` (1 credit, 1 debit) for `TEST_USER` | `e2e-seed.ts`; models `Wallet`(770)/`WalletTransaction`(779) | `wallet.spec` WA-03/WA-05 assert real txn type + reference (drop the skips) | `[ ]` |
| EH-1.3 | Seed a `Review` (+ `ReviewVote`) on a seeded product | `e2e-seed.ts`; `Review`(434)/`ReviewVote`(454) | `review.spec` RV-05/RV-06 assert author/date/helpful button | `[ ]` |
| EH-1.4 | Seed a `SupportTicket` (+ one note) for `TEST_USER` | `e2e-seed.ts`; `SupportTicket`(868) | `support.spec` SU-04/SU-05 assert detail + reply | `[ ]` |
| EH-1.5 | Seed `Order`s in each state (PLACED/SHIPPED/DELIVERED/RETURN_REQUESTED) | `e2e-seed.ts`; `Order`(319)/`OrderItem`(363) | `orders*`/`return.spec` RT-04/RT-05, OR-02/OR-08 assert real line items + state UI | `[ ]` |
| EH-1.6 | Convert soft assertions → real (sweep) | all affected specs | `.catch(()=>false)` count ↓ to ≤ 20; remaining ones commented as intentional | `[ ]` |
| EH-1.7 | De-India `pincode.spec.ts` literals (110001/400001/"Mumbai") | `e2e/pincode.spec.ts`; warehouse modal placeholders `admin/warehouses/page.tsx` + `checkout/page.tsx` (`6-digit pincode`) | currency/postal-neutral; passes on default USD store | `[ ]` |

## Phase 2 — Speed & structure (M–L effort)

| ID | Task | Files | Acceptance | Status |
|---|---|---|---|---|
| EH-2.1 | API-based auth in setup (login via `/auth/login` → write `storageState`) instead of UI login | `e2e/*.setup.ts`, `e2e/helpers.ts` | setup ~instant + robust; UI-login flow still covered by an `auth.spec` test | `[ ]` |
| EH-2.2 | Make setup non-cascading + visible | `playwright.config.ts` (project deps), `e2e-stack.yml` reporter | a setup failure reports its blast radius explicitly; consider `retries` on setup only | `[ ]` |
| EH-2.3 | Run `chromium-public` (no-auth) as a fast **early gate** before auth projects | `e2e-stack.yml` (split step) or a separate quick job | wiring/login regressions fail in ~2 min, not ~20 | `[ ]` |
| EH-2.4 | Shard Playwright across CI matrix (`--shard=i/N`) | `e2e-stack.yml` (matrix), `playwright.config.ts` | wall-clock ≤ 5 min; merged report | `[ ]` |
| EH-2.5 | (stretch) `workers > 1` via per-worker test users | seed + `helpers.ts` + config | in-project parallelism; no shared-user contention | `[ ]` |
| EH-2.6 | Cache the prod Docker build in CI (build is the ~15 min cold long-pole) | `e2e-stack.yml` (buildx cache / GHA cache) | warm-cache build ≤ 5 min | `[ ]` |

## Phase 3 — Make perf gates real (M effort)

| ID | Task | Files | Acceptance | Status |
|---|---|---|---|---|
| EH-3.1 | Capture a **CI-representative** Lighthouse baseline (run on the runner, commit it) | `frontend/lighthouse-baseline.json` | `baseUrl` ≠ `"PLACEHOLDER"`; scores from a real CI/staging run | `[ ]` |
| EH-3.2 | Fix `check-lighthouse.js` category gate: symmetric `Math.abs` → **regression-only** (improvement must not fail) | `frontend/scripts/check-lighthouse.js:143` | a +Δ score passes; only `prior - current > cap` fails (CLS already one-way) | `[ ]` |
| EH-3.3 | Drop Lighthouse `continue-on-error` (re-harden) | `.github/workflows/e2e-stack.yml`, `.gitlab-ci.yml` | Lighthouse blocking again, green on real scores | `[ ]` |
| EH-3.4 | Capture k6 baseline + drop its soft-fail | `bench/baseline.json`, both CI files | k6 blocking | `[ ]` |

## Phase 4 — Shift-left guards (deferred from the QA discussion; cheap insurance)

Catch the recurring *correctness* bugs in ~1 s instead of a 20-min e2e cycle.

| ID | Task | Files | Acceptance | Status |
|---|---|---|---|---|
| EH-4.1 | `Footer` "no client-side fetch" RTL test | `frontend/src/components/layout/__tests__/Footer.test.tsx` (new) | render in `HideBadgeProvider`; spy `fetch` → **0 calls**; badge toggles on context | `[ ]` |
| EH-4.2 | `server-api.ts` precedence unit test | `frontend/src/lib/__tests__/server-api.test.ts` (new) | asserts `BACKEND_INTERNAL_URL > NEXT_PUBLIC_API_URL > default` | `[ ]` |
| EH-4.3 | ESLint rule: ban `process.env.NEXT_PUBLIC_*` backend-URL reads in server-only modules | `frontend/.eslintrc*` (`no-restricted-properties`/`no-restricted-syntax`) or `packages/eslint-plugin-shopverse` | route handlers/SSR/`lib/server-api` callers may not read `NEXT_PUBLIC_API_URL`; lint fails if they do | `[ ]` |

---

## Sequencing & dependencies

```
Phase 0 (independent, do now)
  └─> Phase 1 (seed fixtures gate the assertion conversions)
        └─> Phase 2 (API auth setup builds on stable seed; shard after green)
Phase 3 (independent; needs one CI run to capture baselines)
Phase 4 (independent; quick insurance, can land anytime)
```

## Verification (per phase)

- **Local stack**: `docker compose -f docker-compose.ci.yml up -d` → seed → `cd frontend && PLAYWRIGHT_BASE_URL=http://localhost:3000 PLAYWRIGHT_API_URL=http://localhost:3001 npx playwright test`.
- **Smells regression-check** (should trend down): `grep -rc waitForTimeout e2e/*.spec.ts` · `grep -rc "catch(() => false)" e2e/*.spec.ts`.
- **CI**: E2E Stack #N green; runtime trending toward the ≤ 8 min target.
- **Gates unchanged**: backend tsc; frontend tsc + lint `--max-warnings=0` + jest.

## Done when

All EH-* are `[x]`; full Playwright run ≤ 8 min, zero timing-flake, Lighthouse +
k6 blocking against real baselines, and the `.catch(()=>false)` soft-test count
is ≤ 20 (each remaining one justified). Then delete this tracker.
