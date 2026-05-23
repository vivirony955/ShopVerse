# How we built a double-entry ledger into our open-source ecommerce platform

*Draft launch post — copy-paste to HN / Dev.to / r/programming with light editing for your venue.*

---

## TL;DR

We open-sourced **ShopVerse**, a NestJS + Next.js + PostgreSQL ecommerce
platform that treats financial correctness as a first-class concern. Most
OSS commerce projects bolt money handling onto a CRUD app and hope nothing
drifts. We built a double-entry ledger, 13 named invariants, and an hourly
cron that verifies them on real production data.

If you've ever debugged a wallet that's ₹2 off and don't know which of the
last 10,000 transactions did it — this is for you.

Repo: https://gitlab.com/aiexperts/ecommWeb
License: Elastic 2.0 (free for non-commercial use)

---

## The problem nobody talks about

Open-source ecommerce projects in 2026 mostly look like this:

```
Order placed → debit wallet → charge card → mark order paid
```

This works 99% of the time. The 1% — the gateway timeout that retries, the
duplicate webhook, the wallet deduction that goes through while the card
auth fails — is where money quietly disappears.

The standard remediation: ship faster, hire ops, build dashboards to catch
discrepancies after they happen.

We took a different bet: **make the discrepancy impossible to express in
the data model in the first place.**

---

## The model

Every money movement in ShopVerse produces two rows:

1. A `WalletTransaction` (or `PaymentReconciliation`, depending on the
   leg) — the operational record the user sees.
2. A `LedgerEntry` — debit on one side, credit on the other, mirrored.

A unique constraint on `(walletId, reference, type)` makes idempotency a
database concern, not an application one. A duplicate webhook hits a
P2002, we catch it, return the existing record.

Then we name the invariants:

- **I-3:** Sum of all signed `WalletTransaction` amounts equals the
  current `Wallet.balance` per user.
- **I-4:** Sum of all `LedgerEntry.debit` equals sum of all
  `LedgerEntry.credit` (trial balance).
- **I-7:** Sum of completed refunds for an order never exceeds the order
  total.
- **I-11:** Every non-zero refund movement has a `RefundRequest` row
  pointing at it.
- **I-12:** `WalletTransaction.reference` is unique per non-auto operation.

There are 13 in total. Multi-warehouse inventory has its own (I-1, I-2,
I-10). Order math has I-5. Payment idempotency is I-6. Invoice sequence
gaps are I-13.

---

## The cron that catches the rest

We run an hourly `InvariantValidatorService` that re-checks every named
invariant against live data. When something violates, it emits a
machine-readable log line:

```
[INVARIANT_ALERT] I-3 violated: wallet=4123 expected=12500.00 actual=12498.50 diff=-1.50
```

That gets piped to whatever alerting stack the operator has wired up. The
runbook for each invariant is in `docs/runbooks/` — for example,
`wi-drift.md` covers the inventory drift case.

The cron is not a substitute for getting the writes right. It's the
trip-wire that proves they were.

---

## What you actually get

- **38 backend modules**, 54+ Prisma models, 687 integration tests against
  a real PostgreSQL 16 database (not mocked).
- **Stripe + COD payment paths** with reconciliation.
- **Internal wallet** with double-entry ledger and a lifetime balance cap.
- **Multi-warehouse inventory** with TTL-based cart reservations and
  atomic warehouse-side commit on shipment.
- **Maker-checker refund approval** for amounts above a configurable
  threshold.
- **PDF invoice generation** with sequential numbering per Indian financial
  year.
- **Guest checkout** with rate-limiting and pre-order fraud screening.
- **Flash sales** with atomic per-user purchase cap enforcement.
- **Referral system** with self-referral block and per-new-user uniqueness.
- **Pincode serviceability** and delivery-slot booking with atomic
  capacity.

---

## What we're *not* doing (yet)

- Plugin / extension SDK. We're a product, not a platform — for now.
- B2B / multi-tenant. The model is single-tenant DTC.
- Hosted offering. You self-deploy via Docker, Ansible, or (soon) Helm.
- GraphQL. REST only.

If you need any of those, Medusa / Saleor / Vendure are better fits.

---

## Where we'd love help

- A first production deployment we can write a case study about.
- A plugin / extension architecture proposal (RFC welcome).
- Frontend storybook + design tokens (the storefront is functional but
  unstylish).
- More Indian payment integrations (Razorpay, PhonePe, UPI deep links).

Issues labelled `good first issue` are linked from the README.

---

## The bigger question

Should financial correctness be a feature, or table stakes? We think
"feature" — because right now, in practice, it isn't table stakes for OSS
commerce. The first project that takes it seriously gets the trust dividend.

Repo, design doc, and 687 tests await your scrutiny.

→ https://gitlab.com/aiexperts/ecommWeb
