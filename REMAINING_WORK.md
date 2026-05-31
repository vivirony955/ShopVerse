# ShopVerse — Remaining Work

> Single source of truth for what's left after the W1–W11 programme
> wrapped up. All older trackers (`ARCH_EVOLUTION_TRACKER.md`, the 6
> wave trackers under `waves/`, the cross-cutting trackers, the older
> A3/P1/MASTER docs, and `POST_W6_REMEDIATION_PLAN.md`) are deleted
> — this file replaces them.
>
> Last update: 2026-05-31 (end of W11 + post-W11 e2e green-out).

## Programme status

| Layer | State |
|---|---|
| W1–W6 architecture evolution | **97 / 97 verified** (the W6.T3 PluginLoader bootstrap that held the final 1 closed in commit `94595ce`) |
| W7–W11 post-W6 remediation | **8 of 13 tasks shipped + 5 properly classified** (3 deferred, 1 passive, 1 partial) |
| Test floor | **1532 pass / 0 skip / 0 fail** across packages + Nest unit + Jest + integration + Playwright e2e |
| Both CI pipelines green | GitHub Actions + GitLab CI both wired and exercising the test floor |

The next paragraph of work is **optional** — there is no blocker on
v1 ship readiness. Items below are what to do when there's time,
ordered by priority.

## Priority legend

| Tag | Meaning |
|---|---|
| **P1** | Real engineering value; do in next focused session |
| **P2** | Dedicated session; high-risk OR architecturally meaningful |
| **P3** | Passive — clock running, no work required |
| **P4** | Roadmap; correctly out of v1 scope, capture so it doesn't get re-discovered each quarter |

---

## P1 — Active engineering deferrals

### CPN-D02 race-condition fix [POST_W6 §3.1]

- **Status:** deferred (was Task 7 in W7–W11)
- **Effort:** ~2 hr (could grow to 3)
- **Personas:** PERF_ENGINEER + DBA + QA_ENGINEER
- **Why deferred:** No real trace yet. Picking Path A (bump `connection_limit`) vs Path B (batch event publishes in `placeOrder`) without one is guesswork.

**Re-open trigger:**
After the new e2e-stack pipeline (commit `924ebcc`) runs on 5+ PRs, capture pool-acquire vs query latency. Then choose path from the trace, not by guess.

**Path A** (cheap masking): bump test DATABASE_URL `connection_limit` from 3 → 10. Cheap; doesn't change kernel behaviour; document the masking decision.

**Path B** (real fix): batch event publishes in `placeOrder` after HTTP response. Touches hot path; requires invariant review (I-1 inventory, I-3 wallet).

**Hard time-box: 60 min** on trace capture. If no signal, default to Path A and document honestly.

### PAY-E02 follow-up sweep [POST_W6 §3.2 — optional polish]

- **Status:** partial — 39 swallows in `test/helpers/db.ts` narrowed to P2021-only (commit `ce642b2`). `test/helpers/factories.ts` + `concurrency.ts` likely have similar patterns.
- **Effort:** 30 min
- **Personas:** AUDITOR + QA_ENGINEER

`grep -rE '\.catch\(\(\)\s*=>\s*\{\}\)' test/helpers/` and apply the same narrow `ignoreMissingTable` helper. Run integration suite once to confirm no real bug got unmasked.

---

## P2 — High-risk / dedicated-session deferrals

### Task 10 — SDK re-export sweep [POST_W6 §5.1]

- **Status:** deferred
- **Effort:** multi-hour (significantly more than POST_W6's 30-min-per-plugin estimate)
- **Personas:** ARCHITECT (primary) + IMPLEMENTER
- **Why deferred:** Architectural class-identity trap. Documented inline in [packages/eslint-plugin-shopverse/src/rules/no-kernel-import.ts](packages/eslint-plugin-shopverse/src/rules/no-kernel-import.ts) — re-exporting kernel classes from `@shopverse/sdk/nest` works in monorepo dev mode but breaks for published-SDK third-party plugin consumers because NestJS DI uses class identity for tokens.

**Real fix path:** moderate token-based DI refactor — kernel registers `{ provide: 'KERNEL_PRISMA', useExisting: PrismaService }`, SDK exports the token + a TS interface, plugins inject via `@Inject('KERNEL_PRISMA')`.

**Current allow-list is NOT a bug** — it's the documented contract for first-party plugins co-located with the kernel.

### Task 12 — pnpm workspaces migration [POST_W6 §5.2]

- **Status:** deferred — highest single-task risk
- **Effort:** 4–6 hr
- **Personas:** IMPLEMENTER + ARCHITECT
- **Why deferred:** Touches every package's install path + the npm publish flow for `@shopverse/sdk*`. The dual-React workaround (W5.T5) needs to survive. CI cache key strategy changes.

**Plan when picked up — phased, gated:**
1. **12a Audit on throwaway branch.** No commit. Run `npm pack --dry-run` from each publishable package before + after; tarball contents must match. One full `pnpm install` + 1532-test run.
2. **Architect gate** based on what broke.
3. **12b Probe.** Migrate ONE package (recommend `cli`) from `file:` to `workspace:*`. Verify `npm pack --dry-run` unchanged; cli tests pass.
4. **Architect gate.**
5. **12c Full migration.** All packages + backend + frontend + test. Rewrite CI to `pnpm install` + `pnpm test`. Rollback: restore 8 `package-lock.json` from git + delete `pnpm-workspace.yaml`.

---

## P3 — Passive (clock running, no work)

### DR-H01 monitoring closure [POST_W6 §3.3]

- **Status:** monitoring
- **Effort:** 0 active
- 2-week clock started when the e2e pipeline activated in commit `924ebcc`. Close as "won't fix; not reproducible" on 5 consecutive clean integration runs.
- If it recurs in any of the 5 monitoring runs, reopen with the recurrence trace.

### W6.T11 — real new-contributor onboarding walk-through

- **Status:** partial (maintainer doc-validation pass done — 2 drifts in `docs/plugins/tutorial.md` fixed in W8 batch)
- **Effort:** 1 hr (for a new contributor)
- **Why passive:** POST_W6 §11.10 design accepts this as the single "blocked-on-human" item to close the programme at 100/100. The maintainer self-walk catches doc drift but not UX/comprehension issues — that's the gap a real new contributor closes.

**Trigger to close:** A new contributor follows `docs/plugins/tutorial.md` in a clean shell, ships a working plugin in < 60 min, and files any issues encountered.

---

## P4 — Roadmap (correctly out of v1 scope)

Captured here so the items don't get re-discovered every quarter.
Source: POST_W6_REMEDIATION_PLAN.md §6 + architecture plan §10.

| Item | Why deferred | Revisit trigger |
|---|---|---|
| Multi-tenant | Plan §10 E14 — explicit single-tenant v1; storefront contracts + DB schema would change | "Manage 3 stores with 1 login" customer demand |
| Plugin sandboxing (Node-level) | Plan §10 E25 — third-party plugins are trusted code in v1 | Operators willing to pay container-isolation cost per plugin |
| Mobile app (React Native / Flutter) | Web responsive is sufficient for India market | NPS drops on mobile-web checkout |
| Plugin marketplace UI | Docs-only catalog sufficient for first-party + early third-party | Third-party plugin count > 10 |
| 0-to-store wizard | QUICKSTART sufficient for technical operators | Competing with Shopify Basic on setup speed |
| Theme economy | One Tailwind theme + slots sufficient | "Looks like ShopVerse" becomes a real conversion loss |
| AI/LLM features (search, recs) | Outside the W1–W6 plugin-model scope | Competitive pressure from Shopify's AI features |
| Microservice extraction | Plan §10 — deferred indefinitely | Multi-team or multi-tenant becomes a hard requirement |
| Multi-cloud / multi-region | Separate runbook exists | Region-specific compliance demand |
| Persistent staging URL | Ephemeral docker-compose CI stack lands the functional outcome | Manual QA workflow needs a long-lived URL |
| Lighthouse + k6 on GitLab side | Same self-skip pattern as GitHub; defer until staging URL lands | When P4 staging URL item revisits |

---

## What got done (audit trail)

| Commit | Programme item |
|---|---|
| `924ebcc` | W7 batch — ephemeral CI stack + Playwright + Lighthouse + k6 + admin/plugins e2e |
| `ce642b2` | W8 batch — metrics-bridge + PAY-E02 swallow audit + GitHub coverage CI + 3 deferrals documented |
| `5351b1e` | W7 follow-up — admin-plugins integration spec repair (auth + URL prefix) |
| `2192329` | 10k VU bench scenario + infra docs |
| `28df0ec` | TEST_USER + TEST_ADMIN seeded for Playwright auth setup |
| `70341b4` | Next.js `transpilePackages` fix — closed 45 e2e failures with one config line |
| `94595ce` | PluginBootstrapService + loader status mapping — closed W6.T3 bootstrap gap (3 e2e + 6 integration tests) |
| `e6c9df3` | E2E category display-name rename — closed ACAT-02 selector race |
| `1c735d4` | Payment Add-to-Bag force-click — closed last 4 e2e flakes |

Before these landed: **720** tests gated in CI, **6** test-skips on a documented bug, **/admin/plugins** returning `[]` in prod.
After: **1532** tests gated, **0** skips, **0** known production bugs from W1–W6 work.

---

## How to use this file

- Pick the highest-priority item with an unmet trigger.
- If it's P1, work it in a normal session.
- If it's P2, schedule a dedicated session — they need uninterrupted focus + an architect lens.
- If it's P3, just keep monitoring; no work to schedule.
- If it's P4, leave it alone unless its revisit-trigger fires.

When an item closes, delete its row from this file. When this file is empty, the programme is shipped.
