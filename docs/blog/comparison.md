# ShopVerse vs Medusa vs Saleor: when financial correctness matters

*Draft comparison post.*

---

## Why this comparison exists

Every "open-source ecommerce" comparison published in the last three years
asks the same questions: GraphQL or REST? Plugin ecosystem size? Hosted
or self-hosted? Multi-tenant or single?

Nobody asks: **what happens to your books when a Stripe webhook fires
twice?** Or: **does the cart reservation actually decrement the warehouse
inventory atomically, or check-then-act with a race?**

We built ShopVerse to ask those questions out loud. Here's how the three
biggest players answer them — and how we differ.

---

## Quick orientation

| | **ShopVerse** | **Medusa** | **Saleor** |
|---|---|---|---|
| Stack | NestJS + Next.js + Prisma + PostgreSQL | Node.js + REST/GraphQL + PostgreSQL | Python (Django) + GraphQL + PostgreSQL |
| First commit | 2025 | 2018 | 2018 |
| Stars (approx) | <50 | 27k | 21k |
| Plugin ecosystem | None yet | 200+ | Apps marketplace |
| Hosted offering | No | Medusa Cloud | Saleor Cloud |
| License | Elastic 2.0 | MIT | BSD-3 |

Honest read: Medusa and Saleor are years ahead on ecosystem and brand.
We're not pretending otherwise.

---

## Where we differ: financial correctness

### Double-entry ledger

| | ShopVerse | Medusa | Saleor |
|---|---|---|---|
| Internal wallet / store credit | Yes, with explicit `WalletTransaction` table | Yes, via gift cards / store credits | Yes, via gift cards |
| Every money movement produces a paired ledger entry | Yes (`LedgerEntry` table, I-4 invariant) | No — relies on payment provider records | No — relies on payment provider records |
| Trial-balance verifier | Hourly cron | None | None |

### Idempotency

| | ShopVerse | Medusa | Saleor |
|---|---|---|---|
| Database-enforced webhook idempotency | Unique constraint on gateway ref (I-6) | Application-level dedup | Application-level dedup |
| Conditional `UPDATE … WHERE` for state transitions | Standard pattern in code | Mixed | Mixed |
| P2002 catch as expected control flow | Yes, documented | Not standard | Not standard |

### Refund safety

| | ShopVerse | Medusa | Saleor |
|---|---|---|---|
| `RefundRequest` row required before money moves (I-11) | Yes | No | No |
| Sum-of-refunds ≤ order total enforced (I-7) | Yes, validator + DB | Application code | Application code |
| Maker-checker approval above threshold | Built-in | Custom code | Custom code |

### Named invariants

ShopVerse ships with 13 named invariants verified by a cron job. Medusa
and Saleor do not have a parallel concept — they rely on writing the
code correctly and using payment-provider reconciliation as the
backstop.

---

## Where they differ from us: ecosystem

### Plugins / extensions

Medusa has the most mature plugin model. If your business needs a specific
ERP integration, a Medusa plugin probably exists. Saleor's app system is
newer but architecturally clean. ShopVerse currently has no plugin
architecture — the modules are internal NestJS modules, not extension
points.

### Hosted offering

Medusa Cloud and Saleor Cloud both let you skip the deployment story.
ShopVerse you self-deploy: Docker Compose for a single box, Ansible for a
3-tier VM split, Helm for Kubernetes (planned).

### Frontend templates

Medusa and Saleor both ship starter storefronts that look modern out of
the box. ShopVerse's frontend is functional but visually utilitarian.

### B2B / multi-tenant

Saleor has a real B2B story. Medusa supports multi-region pricing.
ShopVerse is single-tenant DTC — by design.

---

## When to pick which

**Pick Medusa if:**
- You need a plugin ecosystem yesterday.
- You want a hosted option.
- You're building globally, not region-first.

**Pick Saleor if:**
- You're doing B2B or multi-tenant.
- Your team is GraphQL-native.
- You want enterprise references (Saleor has them).

**Pick ShopVerse if:**
- You're building for India and want pincode / GST / COD / warehouse
  routing built in, not bolted on.
- You've been burned by a "₹2 off" wallet bug and want the ledger to
  prove correctness.
- You'd rather have 38 well-tested modules than 200 of-mixed-quality
  plugins.
- Your finance team needs to audit and is asking for trial-balance
  reports.

---

## What we're not claiming

We're not faster than Medusa (probably comparable; benchmarks pending).
We're not feature-richer than Saleor on storefront capabilities. We're
not more popular than either (we have weeks of GitHub history, not years).

What we are: opinionated about which 1% of edge cases will ruin your
month, and explicit in the schema about how we prevent them.

---

## See for yourself

- Repo: https://gitlab.com/aiexperts/ecommWeb
- The 13 invariants, defined: `SYSTEM_DESIGN_FINAL.md` §2
- The hourly validator: `backend/src/common/invariant-validator.service.ts`
- 687 integration tests against a real PostgreSQL: `test/`

Fork it, run it, try to break an invariant. If you can, we want to know.
