# ShopVerse — Remaining Work

> Single source of truth for everything left between "code complete"
> and "live customers shopping." The W1–W11 engineering programme is
> functionally done; **the app has NOT been shipped to customers
> yet**. Most engineering deferrals don't block launch. The launch
> checklist below is what actually matters.
>
> Last update: 2026-05-31.

## Programme state

| Layer | State |
|---|---|
| W1–W6 architecture evolution | 97 / 97 verified |
| W7–W11 post-W6 remediation | 8 of 13 tasks shipped + 5 properly classified |
| Test floor | 1532 pass / 0 skip / 0 fail across 8 layers |
| Both CI pipelines green | GitHub Actions + GitLab CI |
| **Live customer traffic** | **NOT YET — see §A** |

## Verdict — read this before picking work

There are two very different piles of work mixed together:

1. **Launch-readiness** (§A). Hard infra + legal + operator-side
   items that prevent customers from using the app at all. **Pick
   from here.**
2. **Engineering polish** (§B / §C). Internal quality items the
   programme deferred because they don't affect prod behaviour.
   **Skip until post-launch unless you have spare time.**

If forced to pick ONE thing right now, it's §A1.1 (provision real
secrets) — everything downstream depends on it.

## Priority legend

| Tag | Meaning |
|---|---|
| **P0** | Launch blocker — can't take real customer traffic without |
| **P1** | Strong blocker — technically can ship, operationally painful |
| **P2** | Pre-launch nice-to-have OR active engineering deferral with real value |
| **P3** | Post-launch OR passive (clock running, no work needed) |
| **P4** | Roadmap — correctly out of v1 scope; captured to prevent re-discovery |

---

# §A — Launch readiness (customer-facing)

These were correctly out of scope of the W1–W11 engineering plan but
are what actually stand between today's state and a live storefront.

## A1 — P0 — Cannot ship without

### A1.1 Production secrets

Generate real values for:

| Env var | Today | Required |
|---|---|---|
| `JWT_SECRET` | dev placeholder | 32+ char random; rotate quarterly |
| `JWT_REFRESH_SECRET` | dev placeholder | 32+ char random; different from access |
| `STRIPE_SECRET_KEY` | `sk_test_*` | `sk_live_*` (activate Stripe IN account first) |
| `STRIPE_WEBHOOK_SECRET` | dev placeholder | `whsec_*` from Stripe dashboard webhook config |
| `NEXTAUTH_SECRET` | dev placeholder | 32+ char random; can equal `JWT_SECRET` |
| `SMTP_PASS` | dev placeholder | Real Resend API key (or equivalent provider) |
| `SMTP_FROM` | `ci@shopverse.dev` | Real verified sender domain |

Verify: `docker compose config` against the prod .env shows no
`*_dummy_*` or `placeholder` values.

### A1.2 Stripe live mode activated

- [ ] Stripe IN account fully activated (KYC + bank account verification)
- [ ] Live API keys generated + stored in prod secrets manager
- [ ] Webhook endpoint registered in Stripe dashboard pointing at `https://<your-domain>/api/payments/webhook` with the events ShopVerse listens for
- [ ] First successful test order against live mode (₹1 product, refund immediately)

### A1.3 SMTP provider account

- [ ] Resend account created (or alternative — Mailgun, AWS SES, etc.)
- [ ] Sender domain verified (DNS records added)
- [ ] First test email lands in a real inbox (signup confirmation flow)
- [ ] Bounce + complaint handling configured

### A1.4 Production Postgres + backup

- [ ] Managed Postgres OR hardened self-host with: superuser ≠ app user, app user has only its DB privileges
- [ ] `connection_limit ≥ 100` set in DATABASE_URL for backend
- [ ] **Automated daily backups to off-host storage** (S3 / B2 / GCS)
- [ ] **Point-in-time recovery configured** (managed: tick the box; self-host: WAL archiving)
- [ ] **Restore drill completed** — restore a backup to a scratch DB, verify row counts. An untested backup is no backup.
- [ ] Disk usage alert at 70%

### A1.5 Production Redis

- [ ] Managed Redis OR self-host with `requirepass` set
- [ ] `maxmemory-policy allkeys-lru` confirmed (the prod compose has it)
- [ ] Persistence disabled (`--save ""`) because ShopVerse uses Redis as cache, not source of truth

### A1.6 Domain + TLS

- [ ] Domain registered (Hover / Cloudflare / etc.)
- [ ] DNS A/AAAA records pointing at the load balancer / reverse proxy
- [ ] TLS cert (Let's Encrypt auto-renew via certbot or Caddy)
- [ ] HSTS header on after first successful HTTPS

### A1.7 Privacy Policy + Terms of Service

DPDP (India's privacy law) requires consent + privacy disclosure for
personal data processing. Stripe + Resend also flag accounts that go
live without these pages.

- [ ] Privacy Policy page live at `/privacy` (lawyer-reviewed or use a generator like Termly + lawyer pass)
- [ ] Terms of Service live at `/terms`
- [ ] Refund / Return Policy live at `/returns` (Stripe checks this)
- [ ] Linked from footer + signup flow

### A1.8 Real product catalog

- [ ] At least 50 real SKUs with: name, slug, description, real images (NOT placehold.co), category, brand, base price, discount, stock per variant
- [ ] Categories + brands populated to match the catalog
- [ ] First admin account created in prod DB with **rotated password from the seed default** (`admin@store.com / Admin@123456` is what `seed.ts` creates — never expose this to prod)

### A1.9 At least 1 real warehouse + pincode serviceability

- [ ] One `Warehouse` row with real address + pincode
- [ ] `PincodeServiceability` populated — every pincode you serve, mapped to its warehouse + ETA
- [ ] Without this, every checkout fails the "is this address serviceable?" check.
- [ ] Source data: India Post pincode CSV (~150k entries) — filter to your covered cities

## A2 — P1 — Strong blockers (operational pain to ship without)

### A2.1 Observability live

- [ ] Sentry DSN set in prod env (`SENTRY_DSN`)
- [ ] OTel collector endpoint set (`OTEL_EXPORTER_OTLP_ENDPOINT`); spans flowing
- [ ] Prometheus scraping the backend's `/metrics`
- [ ] Grafana dashboards for: error rate, p95 latency, payment success rate, cart-abandonment, daily order count
- [ ] Sentry rule: alert on error rate > 1% sustained 5 min

### A2.2 Operations runbook

`DEPLOYMENT.md` covers deploy. You need an `OPERATIONS.md` for the
human-side tasks:

- How to issue a refund
- How to create / disable a coupon
- How to start / end a flash sale
- How to investigate a failed payment
- How to add a warehouse or pincode
- How to disable a plugin in production (the W1.T20 / W7 admin/plugins kill switch)
- How to rotate secrets without downtime
- On-call escalation contacts

### A2.3 Rate-limit tuning for real traffic

- [ ] Current limits are conservative defaults. Re-check against expected QPS after first week of traffic.
- [ ] Tighten login + signup rate limits (anti-credential-stuffing) once traffic shape known.

### A2.4 CORS + cookie domain

- [ ] `CORS_ORIGIN` set to the production domain (currently defaults to `http://localhost:3000`)
- [ ] NextAuth cookie domain matches the public domain

### A2.5 Stripe webhook registered + verified end-to-end

- [ ] Webhook URL added in Stripe dashboard with the live secret
- [ ] First live `payment_intent.succeeded` webhook delivered + handled (check `PaymentReconciliation` row created)

## A3 — P2 — Pre-launch polish

| Item | Why |
|---|---|
| **Persistent staging environment** | Same role the ephemeral CI stack plays for tests, but always-on for manual QA. Reclassified from `REMAINING_WORK.md`'s old P4 because pre-launch QA needs it. |
| **Lighthouse + k6 baselines against staging** | Numeric guardrails for "are we getting slower?" Activate the gates in `frontend.yml` + GitLab `e2e:stack` once the staging URL exists. |
| **Branded email templates** | Default templates work; branded ones build trust. |
| **404 / 500 / empty-state UI walkthrough** | Existing pages handle these but verify each looks intentional. |
| **Cookie consent banner** | DPDP soft requirement; some user jurisdictions hard. |
| `robots.txt` + `sitemap.xml` | SEO + crawl control. |
| **OG image, favicon, manifest.json** | Branding + PWA install. |
| **PostHog token wired** | Frontend already imports the SDK. Get a real project token for product analytics. |
| **Customer-support ticket inbox** | The `support` module exists; pick someone to triage daily. |

---

# §B — Engineering deferrals (skip unless post-launch)

The W7–W11 programme explicitly deferred these with documented
reasons. Pick up only when bandwidth allows AND a real signal calls
for them. **None block customer launch.**

## B1 — P2 — Active engineering deferrals

### B1.1 CPN-D02 race-condition fix (deferred from POST_W6 §3.1)

- **Status:** deferred
- **Effort:** ~2 hr (could grow to 3)
- **Personas:** PERF_ENGINEER + DBA + QA_ENGINEER
- **Why deferred:** No real trace yet. Picking Path A (bump `connection_limit`) vs Path B (batch event publishes) without one is guesswork.

**Re-open trigger:** After the e2e-stack pipeline (commit `924ebcc`) runs on 5+ PRs, capture pool-acquire vs query latency. Choose path from the trace, not guess.

**Path A** (cheap masking): bump test DATABASE_URL `connection_limit` 3 → 10.
**Path B** (real fix): batch event publishes in `placeOrder` after HTTP response; needs I-1 / I-3 invariant review.

Hard time-box: **60 min** on trace capture. If no signal, default to Path A and document.

### B1.2 PAY-E02 follow-up sweep (deferred from POST_W6 §3.2)

- **Status:** partial — 39 swallows in `test/helpers/db.ts` narrowed in `ce642b2`. `test/helpers/factories.ts` + `concurrency.ts` may have similar patterns.
- **Effort:** 30 min
- **Personas:** AUDITOR + QA_ENGINEER

`grep -rE '\.catch\(\(\)\s*=>\s*\{\}\)' test/helpers/` and apply the same narrow `ignoreMissingTable` helper. Run integration suite once after.

## B2 — P2 — High-risk / dedicated-session deferrals

### B2.1 SDK re-export sweep (deferred from POST_W6 §5.1)

- **Status:** deferred
- **Effort:** multi-hour (significantly more than POST_W6's per-plugin estimate)
- **Personas:** ARCHITECT (primary) + IMPLEMENTER
- **Why deferred:** Architectural class-identity trap. Documented inline in `packages/eslint-plugin-shopverse/src/rules/no-kernel-import.ts` — re-exporting kernel classes from `@shopverse/sdk/nest` works in monorepo dev mode but breaks for published-SDK third-party consumers because NestJS DI uses class identity for tokens.

**Real fix path:** moderate token-based DI refactor — kernel registers `{ provide: 'KERNEL_PRISMA', useExisting: PrismaService }`, SDK exports the token + a TS interface, plugins inject via `@Inject('KERNEL_PRISMA')`.

Current allow-list is **not a bug** — it's the documented contract for first-party plugins co-located with the kernel.

### B2.2 pnpm workspaces migration (deferred from POST_W6 §5.2)

- **Status:** deferred — highest single-task risk
- **Effort:** 4–6 hr
- **Personas:** IMPLEMENTER + ARCHITECT
- **Why deferred:** Touches every package's install path + the npm publish flow for `@shopverse/sdk*`. Dual-React workaround (W5.T5) must survive. CI cache key strategy changes.

**Phased + architect-gated plan when picked up:**

1. **12a Audit on throwaway branch.** No commit. `npm pack --dry-run` from each publishable package before + after; tarball contents must match. One full `pnpm install` + 1532-test run.
2. **Architect gate** based on what broke.
3. **12b Probe.** Migrate ONE package (recommend `cli`) from `file:` to `workspace:*`. Verify `npm pack --dry-run` unchanged; cli tests pass.
4. **Architect gate.**
5. **12c Full migration.** All packages + backend + frontend + test. Rewrite CI to `pnpm install` + `pnpm test`. Rollback: restore 8 `package-lock.json` from git + delete `pnpm-workspace.yaml`.

---

# §C — Passive (P3)

### C.1 DR-H01 monitoring closure (deferred from POST_W6 §3.3)

- **Status:** monitoring
- **Effort:** 0 active
- 2-week clock started when the e2e pipeline activated in `924ebcc`. Close as "won't fix; not reproducible" on 5 consecutive clean integration runs.
- If it recurs in any of the 5 runs, reopen with the trace.

### C.2 W6.T11 — real new-contributor onboarding walk-through

- **Status:** partial — maintainer doc-validation pass done in W8 batch (2 drifts in `docs/plugins/tutorial.md` fixed)
- **Effort:** 1 hr (for a real new contributor)
- **Why passive:** POST_W6 §11.10 design accepts this as the single "blocked-on-human" item to close the W1–W6 programme at 100/100. The maintainer self-walk catches doc drift but not UX/comprehension issues — only a real new contributor closes that gap.

**Trigger to close:** A new contributor follows `docs/plugins/tutorial.md` in a clean shell and ships a working plugin in < 60 min.

---

# §D — Roadmap (P4)

Captured here so items don't get re-discovered every quarter. Source:
the old POST_W6_REMEDIATION_PLAN.md §6 + architecture plan §10.

| Item | Why deferred | Revisit trigger |
|---|---|---|
| Multi-tenant | Plan §10 E14 — explicit single-tenant v1; storefront contracts + DB schema would change | Customer demand for "manage 3 stores with 1 login" |
| Plugin sandboxing (Node-level) | Plan §10 E25 — third-party plugins are trusted code in v1 | Operators willing to pay container-isolation cost per plugin |
| Mobile app (React Native / Flutter) | Web responsive sufficient for India market | NPS drops on mobile-web checkout |
| Plugin marketplace UI | Docs-only catalog sufficient for first-party + early third-party | Third-party plugin count > 10 |
| 0-to-store wizard | QUICKSTART sufficient for technical operators | Competing with Shopify Basic on setup speed |
| Theme economy | One Tailwind theme + slots sufficient | "Looks like ShopVerse" becomes a real conversion loss |
| AI/LLM features (search, recs) | Outside the W1–W6 plugin-model scope | Competitive pressure from Shopify's AI |
| Microservice extraction | Plan §10 — deferred indefinitely | Multi-team or multi-tenant requirement |
| Multi-cloud / multi-region | Separate runbook exists | Region-specific compliance demand |

---

# §E — Suggested ordering

Time-boxed for a small team. Adjust if you're solo or have more hands.

**Week 1 — Infra & secrets** (A1.1 → A1.6)
Generate secrets. Provision managed Postgres + Redis. Domain + TLS.
Sentry hooked up. **Backup drill completed.**

**Week 2 — Legal & catalog** (A1.7 → A1.9)
Privacy + ToS + Returns shipped. Real product catalog uploaded. Real
warehouse + pincode serviceability data imported.

**Week 3 — Operations + monitoring** (A2.1 → A2.5)
Grafana dashboards live. `OPERATIONS.md` written. Stripe webhook
verified end-to-end. CORS + cookie domain set. Rate limits reviewed.

**Week 4 — Polish + soft launch** (A3 picks)
Branded emails. Cookie banner. Persistent staging environment.
End-to-end customer journey on prod (₹1 product, real card, real
refund). Friends-and-family soft launch.

**Public launch.**

Then return to §B / §C / §D as bandwidth allows.

---

## Audit trail (what shipped to get here)

| Commit | Programme item |
|---|---|
| `924ebcc` | W7 batch — ephemeral CI stack + Playwright + Lighthouse + k6 + admin/plugins e2e |
| `ce642b2` | W8 batch — metrics-bridge + PAY-E02 swallow audit + GitHub coverage CI + 3 deferrals documented |
| `5351b1e` | W7 follow-up — admin-plugins integration spec repair (auth + URL prefix) |
| `2192329` | 10k VU bench scenario + infra docs |
| `28df0ec` | TEST_USER + TEST_ADMIN seeded for Playwright auth setup |
| `70341b4` | Next.js `transpilePackages` fix — closed 45 e2e failures with one config line |
| `94595ce` | PluginBootstrapService + loader status mapping — closed W6.T3 bootstrap gap (3 e2e + 6 integration) |
| `e6c9df3` | E2E category display-name rename — closed ACAT-02 selector race |
| `1c735d4` | Payment Add-to-Bag force-click — closed last 4 e2e flakes |
| `13c39cc` | Consolidated 12 trackers into this single file |

Before the W7–W11 programme: **720** tests gated, **6** test-skips on a documented bug, `/admin/plugins` returning `[]` in prod.
After: **1532** tests gated, **0** skips, **0** known production bugs from W1–W11 work.

The next big step is no longer engineering — it's the **§A launch
checklist**. Pick the highest unmet P0 row, work it, tick it.
