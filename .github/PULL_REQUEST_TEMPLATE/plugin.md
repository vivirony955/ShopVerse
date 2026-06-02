<!--
  Plugin PR template — open with ?template=plugin.md in the URL.
  For non-plugin PRs, use the default template at .github/PULL_REQUEST_TEMPLATE.md.
-->

## Plugin summary

<!-- What does this plugin do? Which slot(s), hook(s), event(s), or strategy(ies) does it use? -->

**Plugin id:** `@shopverse/plugin-<name>`
**Tier:** <!-- pluggable (Tier 3) | core-extended strategy (Tier 2) -->
**Touches (delete the lines that don't apply):**
- Hooks: <!-- e.g. `order.preValidate`, `cart.beforeReserve` -->
- Events: <!-- e.g. `order.placed`, `payment.refunded` -->
- Strategies: <!-- e.g. `PaymentGatewayStrategy(razorpay)` -->
- Slots: <!-- e.g. `pdp.afterDescription`, `nav.beforeUserMenu` -->
- Crons: <!-- name + interval, max 1, ≥ 5 min -->
- Custom queues: <!-- BullMQ queue names -->

## Boundary checklist (plan §3, §4)

- [ ] Plugin id matches `@shopverse/plugin-<name>` (or `@<org>/<name>` for third-party)
- [ ] Backend code lives under `backend/plugins/<name>/` (first-party) or installs from npm (third-party)
- [ ] Frontend code (if any) lives under `frontend/src/plugins/<name>/` (first-party convention per W5.D3)
- [ ] Plugin imports ONLY from `@shopverse/sdk` / `@shopverse/sdk-frontend` — no `@backend/*` paths
- [ ] CODEOWNERS entry added or updated
- [ ] Manifest entry in `backend/plugins.config.ts` with `kernelVersion` peer-dep declared

## Database (plan §4 governance + §10 E5/E8/E9)

- [ ] Plugin's Prisma models live in `prisma/schema/<plugin>.prisma`
- [ ] No FKs from plugin tables to kernel tables (if grandfathered, comment block at the top explains why)
- [ ] If any plugin model has a `userId`-equivalent column → `user.beforeDelete` hook registered for GDPR/DPDP erasure (W6.T5 lint rule will fail otherwise)
- [ ] Migration ordering respected (plugin migrations run AFTER kernel)
- [ ] Uninstall behavior documented: does the plugin require `--drop-data` to remove its tables?

## Performance budgets (plan §5)

- [ ] Sync hooks: max 1 Prisma query (lint rule `no-multi-prisma-in-hook`)
- [ ] No hook handlers inside `prisma.$transaction` (lint rule `no-hook-in-tx`)
- [ ] Cron: ≤ 1 per plugin, interval ≥ 5 minutes
- [ ] k6 baseline regression < 5% on all 5 scenarios (W6.T2 gate; cite the bench output)
- [ ] Frontend bundle ≤ 50 kB per page Δ (W5.T2 gate)
- [ ] Hydration weight ≤ 80 kB per page (W5.T6 gate)
- [ ] SSR slot ≤ 50 ms wrapper time (W5.T3 dev warn)

## Safety + observability (plan §6, §10)

- [ ] CircuitBreaker fallback semantics documented for each hook/strategy
- [ ] Per-plugin Prometheus metrics name-spaced (`{plugin="@shopverse/plugin-<name>"}`)
- [ ] OTel spans attribute `plugin.id` (automatic via SDK; no manual work)
- [ ] Sentry sample rate declared in manifest if chatty
- [ ] Required scopes declared in manifest (`config.scopes`) — minimal set
- [ ] Audit-log calls for any admin mutation (`kernel.audit.log(...)`)

## Frontend (plan §4 slot contract; W5.T8)

- [ ] Slot components are pure render functions (no `fetch()` / Prisma inside)
- [ ] RSC default; `'use client'` only when hooks / browser APIs require it
- [ ] `minHeight` declared per slot registration for CLS shield
- [ ] User-visible strings use `t(key, defaultEn)` from `@shopverse/sdk-frontend`
- [ ] a11y: zero axe violations of severity ≥ "serious" (W5.T5 gate)
- [ ] JSON-LD `@type` (if emitted) registered through `frontend/src/lib/jsonld-registry.ts` — no collisions

## Testing

- [ ] Smoke test in `backend/plugins/<name>/test/` boots kernel + plugin
- [ ] Integration spec at `test/<plugin>.spec.ts` covers happy path + error path
- [ ] `cd backend && npx tsc --noEmit` clean
- [ ] `cd backend && npm run lint -- --max-warnings=0` clean
- [ ] `cd test && npx jest --runInBand --forceExit` — full suite green
- [ ] `cd frontend && npm test` — a11y suite green (if frontend slots ship)
- [ ] `cd frontend && npm run bundle:check` — no regression
- [ ] `cd frontend && npm run hydration:check` — no regression

## Docs

- [ ] `docs/plugins/<name>.md` added (or updated) with usage + config + scope rationale
- [ ] Cross-link from `docs/plugins/index.md` first-party catalog

## DCO sign-off

By submitting this PR, I certify that my contribution is my original work and I have the right to submit it under the Business Source License 1.1 (BSL). Sign commits with `git commit -s -m "..."`.
