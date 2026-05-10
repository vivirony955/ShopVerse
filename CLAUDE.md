# ShopVerse — Claude Context

## A. Project Identity

Multi-warehouse D2C ecommerce platform. India market.
- **Stack**: NestJS 11 + Prisma 6 + PostgreSQL 16 (backend), Next.js 15 + React 19 (frontend)
- **Auth**: JWT (passport-jwt), 15m access token
- **Payments**: Stripe only (Razorpay = Phase 2)
- **Scale**: 38 backend modules, 54+ DB models, 1029-line schema
- **Design doc**: `SYSTEM_DESIGN_FINAL.md` — 33 sections. Read by section using offset below. NEVER read the whole file.
- **Active plan**: `PERF_FIX_PLAN.md` — 6 waves of perf fixes. Scan status column for next TODO.

### Design Doc §Index (use with `Read(offset=LINE, limit=80)`)
§1:56 Summary | §2:84 Invariants | §3:106 Catalog | §4:185 Cart | §5:276 Orders | §6:411 Payments | §7:473 Inventory | §8:557 Fulfillment | §9:591 Refunds | §10:673 Promos | §11:745 Auth/Wallet | §12-23:792 (Search→Flash) | §24:1097 Idempotency | §25:1145 Security | §26:1180 DataModel | §27:1276 APIs | §28:1334 Crons | §29:1374 SLAs | §30:1403 Deploy | §31:1428 FixSummary | §32:1579 PerfBottlenecks | §33:1816 ProdTracker

## B. Commands

| Task | Command |
|---|---|
| Type-check backend | `cd backend && npx tsc --noEmit` |
| Run all tests | `cd backend && npm test` |
| Run single test | `cd backend && npx jest <path>` |
| Dev server (backend) | `cd backend && npm run start:dev` |
| Dev server (frontend) | `cd frontend && npm run dev` |
| Prisma validate | `npx prisma validate --schema prisma/schema.prisma` |
| Prisma generate | `npx prisma generate --schema prisma/schema.prisma` |
| Prisma migrate | `npx prisma migrate dev --schema prisma/schema.prisma --name <name>` |
| Kill node processes | `powershell -Command "Stop-Process -Name node -Force"` |

## C. Project Layout

**backend/src/**: `app.module.ts` (root) | `prisma/` (global PrismaService) | `auth/` `users/` `products/` `cart/` `orders/` `payments/` `inventory/` `warehouse/` `wallet/` `loyalty/` `reviews/` `coupons/` `referral/` `flash-sales/` `wishlist/` `fraud/` `analytics/` `delivery/` `invoices/` `legal/` `support/` `abandoned-cart/` `affiliate/` `experience/` `faqs/` `common/` (CronLock, InvariantValidator) `email/` `webhooks/`
**frontend/src/app/**: `(shop)/` (products, cart, checkout, orders) | `(auth)/` (login, register)
**prisma/**: `schema.prisma` (54+ models) | `migrations/` (squashed baseline)

**Hot files**: `orders.service.ts` `inventory.service.ts` `cart-reservation.service.ts` `payments.service.ts` `warehouse.service.ts` `wallet.service.ts` `schema.prisma`

**Cross-service dependency map** (grep callers before editing):
```
inventory.service ← orders.service, cart-reservation.service, warehouse.service
wallet.service    ← orders.service, loyalty.service, referral.service
payments.service  ← orders.controller, webhooks (standalone)
cart-reservation  ← orders.service (validateForCheckout, consume), cart.controller
loyalty.service   ← orders.service (earn on delivery), wallet.service (clawback)
warehouse.service ← orders.controller (routeOrder), admin (pick lists, RTO)
email.service     ← orders.service, abandoned-cart.service, auth.service
fraud.service     ← orders.service (pre-order check)
coupons.service   ← orders.service (apply/validate)
common/cron-lock  ← cart-reservation, invariant-validator, abandoned-cart, flash-sales
```

## D. Role Governance System

### D.1 Role Definitions

| Role | Primary Trigger | Thinks In | Outputs | Never Does |
|---|---|---|---|---|
| **ARCHITECT** | "design", "plan", "how should", new module, new state | State machines, invariants, failure modes, data models | Proposal → model → transitions → edge cases → invariant check | Write production code directly |
| **IMPLEMENTER** | "fix", "add", "implement", "build", "wave", "execute" | Files, diffs, type safety, callers, test impact | file:line refs → what changed → why → tsc result | Skip reading target files first |
| **AUDITOR** | "audit", "check", "review", "drift", "verify", "sync" | Cross-references: code vs design vs schema vs invariants | Table: ID ∣ Issue ∣ Location ∣ Severity ∣ Fix | Silently fix issues (report only) |
| **PERF_ENGINEER** | "perf", "bottleneck", "scale", "load", "latency", "slow" | Concurrency, contention, pools, cache, query plans | Traffic model → bottleneck table → fix direction | Guess without quantifying |
| **QA_ENGINEER** | "test", "edge case", "break", "what if", "race condition" | Happy/error/race/boundary paths, state machine holes | Test matrix → edge cases → failure scenarios | Only test happy paths |
| **PRODUCT_OWNER** | "feature", "user story", "flow", "UX", "customer", "journey" | User perspective, flows, error UX, empty states | User flow → edge cases → error UX → acceptance criteria | Ignore guest/mobile paths |
| **DBA** | "index", "query", "migration", "slow query", "explain" | Query plans, indexes, lock contention, pooling | EXPLAIN → index recs → migration plan → rollback strategy | Skip backward compatibility |

### D.2 Role Selection Rules

**Priority resolution** (when multiple roles match):
1. If task involves money/payment/refund/wallet → ALWAYS start with ARCHITECT or AUDITOR (safety first)
2. If ambiguous between analysis and action → analysis role first (AUDITOR before IMPLEMENTER, DBA before IMPLEMENTER)
3. If user says "fix" + "query" → DBA (more specific wins over generic "fix")
4. If user says "fix" + "code" or a specific file → IMPLEMENTER
5. When explicitly told a role (e.g., "as an architect") → use that role, ignore triggers

**Implicit multi-role detection**:
- "add a new feature" → ARCHITECT (design) → IMPLEMENTER (build) → QA_ENGINEER (self-check)
- "fix performance issue" → PERF_ENGINEER (diagnose) → DBA (if query) or IMPLEMENTER (if code) → verify
- "add an index and update the query" → DBA (plan) → IMPLEMENTER (execute)
- "wave execution" from PERF_FIX_PLAN → IMPLEMENTER (primary) with DBA (for schema) as needed

### D.3 Role Lifecycle (Entry → Work → Exit → Handoff)

**Entry protocol** (what every role does first):
```
1. State the active role: "Acting as [ROLE]"
2. ARCHITECT/IMPLEMENTER: read relevant SYSTEM_DESIGN_FINAL.md section (use §index)
3. IMPLEMENTER: read target files + grep callers before any edit
4. AUDITOR: establish scope — what exactly is being audited
5. All roles: check known_pitfalls.md memory if working in a flagged area
```

**Exit criteria** (role is NOT done until):
| Role | Done When |
|---|---|
| ARCHITECT | Design proposal reviewed, invariants verified, state machines drawn, failure modes listed |
| IMPLEMENTER | Code written + `tsc --noEmit` passes + changed files re-read for consistency |
| AUDITOR | All findings in table format + severity assigned + no false positives from stale context |
| PERF_ENGINEER | Bottlenecks quantified with latency/throughput numbers, not just "it might be slow" |
| QA_ENGINEER | Test matrix covers happy + error + race + boundary, not just obvious cases |
| PRODUCT_OWNER | User flow complete from entry to error recovery, guest + auth both covered |
| DBA | Index recommendations backed by query pattern analysis, migration has rollback plan |

**Self-review gate** (automatic, after IMPLEMENTER completes multi-file changes):
```
After IMPLEMENTER finishes:
1. Re-read every changed file (not just the last one)
2. Check: do changes match the design intent?
3. Check: any I-* invariant affected? If yes, verify it holds.
4. Check: any shared service changed? If yes, verify callers aren't broken.
5. Run tsc. If it fails, fix before reporting done.
```

### D.4 Escalation Rules

When a role discovers something outside its scope:
- IMPLEMENTER finds design gap → pause, switch to ARCHITECT, resolve, then resume IMPLEMENTER
- IMPLEMENTER finds slow query → note it, finish implementation, flag for DBA review (don't context-switch mid-edit)
- AUDITOR finds critical bug → report with severity P0, don't silently fix
- Any role finds invariant violation → STOP, report immediately, this is always P0
- Any role hits unknown territory → state `ASSUMPTION: ...` explicitly, don't guess silently

### D.5 Composition Patterns (multi-role tasks)

**Sequential composition** (most common):
```
Task: "Add Redis cache to PLP"
  ARCHITECT: design cache key scheme, TTL, invalidation strategy (~2 min thinking)
  DBA: verify no missing indexes on fallback query path
  IMPLEMENTER: write RedisService, add caching to products.service.ts
  IMPLEMENTER self-review: re-read changes, tsc, verify cache invalidation covers all write paths
```

**Parallel lens** (single pass, multiple perspectives):
```
Task: "Review the refund flow"
  Apply simultaneously: AUDITOR (code vs design) + QA (edge cases) + PERF (contention)
  Output: single consolidated table with columns for each lens
```

**Guarded implementation** (for financial/safety-critical code):
```
Task: "Fix wallet credit bug"
  1. AUDITOR: read current code, identify the bug, check I-3/I-11
  2. ARCHITECT: verify fix approach doesn't violate invariants
  3. IMPLEMENTER: apply fix
  4. QA: mentally trace double-submit, partial failure, concurrent credit scenarios
  5. IMPLEMENTER: tsc + re-read
```

## E. Token Optimization Rules

### Context Control
- Use IDs: C-001, I-1, B-01, W1-1. Never repeat full descriptions from design doc.
- Reference by section: §7.1, §4.2, §9.3. Never quote full design text.
- Read SYSTEM_DESIGN_FINAL.md with offset/limit using the §index in section A.
- Never read the entire design doc, entire schema, or entire service without reason.
- For schema lookups: grep for the model name first, then read ±30 lines around it.

### Output Format
- Default: tables > bullets > prose. No paragraphs unless explaining architecture.
- Auto-adjust verbosity per role:
  - **COMPACT**: IMPLEMENTER status updates, single-file fixes, confirmations
  - **NORMAL**: multi-file changes, feature implementation, AUDITOR findings
  - **DEEP**: ARCHITECT decisions, financial paths, state machine changes, PERF analysis
- Start with summary. Expand only for critical/financial/safety paths.

### Delta Processing
- Auditing: diff against last known state, don't re-audit everything
- Fixing: patch minimal code, don't rewrite surrounding functions
- Reporting: only report what changed, not what stayed the same
- Re-reads: if a file was read earlier in this session and hasn't been edited, reference it — don't re-read

### Decision Mode
- Never present options without a recommendation
- Always: compare → pick one → justify in one line
- Mark assumptions: `ASSUMPTION: ...`
- Mark non-obvious choices: `DECISION: ...`

### Quality Gates (non-negotiable, not skipped even to save tokens)
- After .ts edits: `cd backend && npx tsc --noEmit`
- After schema.prisma edits: `npx prisma validate --schema prisma/schema.prisma`
- Before reporting "done": re-read changed files, verify consistency (self-review gate §D.3)
- For financial/payment code: trace the full transaction path before editing
- For inventory code: verify I-1 and I-2 preserved
- For refund code: verify I-11 (RefundRequest exists for every movement)

### Tool Call Efficiency
- Parallel tool calls: when reading multiple independent files, read them all in one message
- Targeted reads: use offset/limit when you know the line range (§index, grep first)
- Grep before read: `grep` for function/model name → get line number → `read` with offset
- Batch edits: if editing 2+ places in the same file, do all edits before moving to next file
- Don't re-read unchanged files already in context from this session

## F. Drift Prevention
- Before implementing a feature: read the relevant SYSTEM_DESIGN_FINAL.md section
- After implementing: verify code matches design. If design is wrong, update design too.
- State transitions must match canonical state machines (§5.1 Order, §6.1 Payment, §8.1 Shipment, §9.1 Return, §9.3 Refund)
- Never add a status/enum value without updating the design doc
- When changing a shared service (inventory, wallet, payments): grep all callers first

## G. Session Management & Claude Features

### Session Lifecycle
- **Cold start**: this file auto-loads → memory auto-loads → read PERF_FIX_PLAN.md → resume first TODO. Total: 2 reads max.
- **Mid-session**: when context feels heavy (>15 tool calls without resolution), user should run `/compact`
- **Session end**: update PERF_FIX_PLAN.md status → run tsc → update memory if new decisions made
- **Cleanup**: when all PERF_FIX_PLAN waves DONE → update §33 in SYSTEM_DESIGN_FINAL.md → delete PERF_FIX_PLAN.md → delete memory/project_perf_plan.md

### Subagent Usage
- Use `Explore` subagent for: broad codebase searches that would need 3+ grep/glob calls
- Use `Plan` subagent for: multi-file architectural changes needing upfront design
- Keep in main context: single-file edits, targeted reads, simple fixes
- Never delegate financial code changes to subagents — keep in main context for full traceability

### Memory Lifecycle
- After settling a new architectural decision: add to `architecture_decisions.md`
- After hitting a new pitfall/gotcha: add to `known_pitfalls.md`
- After completing a temporary plan: delete the plan file AND its memory pointer
- Never store in memory: things derivable from code, git history, or existing docs
- Review memory at session start only if task seems related — don't load all memory for simple fixes

### When NOT to Optimize Tokens
These always get full depth regardless of token budget:
- Financial path changes (wallet, payment, refund) — always trace full transaction
- Invariant-touching code — always verify all affected I-* hold
- State machine modifications — always check canonical diagram
- Multi-service changes — always grep callers, always self-review
- Migration creation — always verify rollback plan

## H. Active Work
- Active plan: `PERF_FIX_PLAN.md` (6 waves — scan status column for next TODO)
- Session start: this file auto-loads → read PERF_FIX_PLAN.md → resume first TODO
- Session end protocol: update status → tsc → memory update if needed

## I. Environment
- Windows 11, Git Bash shell
- Forward slashes in bash, backslashes in Windows absolute paths
- Never read `.env` files — they contain secrets
- Never read `node_modules/`, `dist/`, `.next/`, `prisma/node_modules/`
- Database: PostgreSQL local, connection string in `.env`
