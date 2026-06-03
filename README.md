# ShopVerse

**The open commerce platform where money and inventory can't corrupt — by design.**

[![Pipeline](https://gitlab.com/aiexperts/ecommWeb/badges/main/pipeline.svg)](https://gitlab.com/aiexperts/ecommWeb/-/pipelines)
[![Coverage](https://gitlab.com/aiexperts/ecommWeb/badges/main/coverage.svg?job=test%3Acoverage)](https://gitlab.com/aiexperts/ecommWeb/-/jobs)
![Tests](https://img.shields.io/badge/tests-1180%2B%20passing-brightgreen)
![License](https://img.shields.io/badge/license-BUSL--1.1-blue)
![NestJS](https://img.shields.io/badge/NestJS-11-red)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)

NestJS 11 · Next.js 15 · PostgreSQL 16 · Prisma 6 · React 19 · Stripe · Tailwind CSS

> **Not a Shopify clone. Not a demo.** ShopVerse is production-grade, source-available commerce *infrastructure* — 38 backend modules, a double-entry wallet ledger, race-safe multi-warehouse inventory, and a typed plugin kernel with swappable region packs. Batteries included; deploy in minutes.
>
> The difference vs. every other open-source store: **correctness is enforced, not hoped for.** 13 database-level invariants make overselling and double-refunds impossible *by construction* — backed by 1,180+ tests against a real database.

> Source-available under the [Business Source License 1.1](LICENSE) — **free for production use under $100k/yr GMV**, and each version converts to Apache 2.0 over time. A [commercial license](COMMERCIAL_USAGE.md) applies above the threshold.

---

## What Is ShopVerse?

ShopVerse is a full-stack, multi-warehouse direct-to-consumer commerce platform for **any market** — currency, tax, payment, and locale are store-configured and extended per region via plugins. It covers the complete commerce lifecycle — catalog, flash sales, multi-warehouse fulfillment, payment reconciliation, returns, refunds, and loyalty — with a backend hardened against the security and correctness issues that plague most open-source ecommerce projects.

It is not a toy. The backend has 38 modules, 54+ database models, and **1,180+ tests** (456 unit + 724 integration) running against a real PostgreSQL database — including invariant tests that prove money and inventory stay consistent.

---

## Screenshots

| Storefront | Checkout |
|---|---|
| ![Home](docs/screenshots/01-home.png) | ![Checkout](docs/screenshots/09-checkout.png) |

| Admin Dashboard | Fraud Console |
|---|---|
| ![Admin Dashboard](docs/screenshots/16-dashboard.png) | ![Fraud Console](docs/screenshots/26-fraud.png) |

A full set of 28 screenshots covering customer flows and admin panels lives in [`docs/screenshots/`](docs/screenshots/).

---

## Feature Overview

### Core Commerce

| Feature | Status | Notes |
|---|---|---|
| Product catalog (variants, specs, images, video) | ✅ | Size chart, specifications JSON, video embed |
| Cart with inventory reservation | ✅ | TTL-based, cron-enforced expiry |
| Order lifecycle (PLACED → DELIVERED) | ✅ | Full state machine, all transitions guarded |
| Stripe payments | ✅ | Intent, confirm, webhook, reconciliation |
| COD (Cash on Delivery) | ✅ | |
| Wallet (internal balance) | ✅ | Double-entry ledger, configurable balance cap |
| Split payment (Wallet + Card) | ✅ | Deduct wallet first, charge remainder |
| Multi-warehouse inventory routing | ✅ | Single WH or auto-split across warehouses |
| Fulfillment (pick lists, tracking, delivery) | ✅ | Warehouse-level, with tracking code |
| Returns (RTO, customer-initiated) | ✅ | State machine: INITIATED → APPROVED → RECEIVED → RESTOCKED |
| Refunds (wallet instant, Stripe async) | ✅ | RefundRequest → gateway → COMPLETED |
| Invoice generation | ✅ | Sequential numbering, PDF export |

### Search & Discovery

| Feature | Status |
|---|---|
| PostgreSQL full-text search (tsvector + GIN) | ✅ |
| Autocomplete with thumbnails, price, brand | ✅ |
| Faceted filters with counts ("Nike (42)") | ✅ |
| Recently viewed products (server-persisted) | ✅ |
| Trending / popular searches | ✅ |
| Voice search (Web Speech API) | ✅ |
| Price history graph on PDP | ✅ |
| Price drop alerts | ✅ |

### Promotions & Loyalty

| Feature | Status |
|---|---|
| Coupons (flat, %, free shipping, cashback, first-order) | ✅ |
| Flash sales with per-user quantity cap | ✅ |
| Tiered loyalty (Silver / Gold / Platinum) | ✅ |
| Earn/redeem/clawback loyalty points | ✅ |
| Referral program with wallet credit | ✅ |
| Volume / tiered discounts ("Buy 3, get 10% off") | ✅ |
| Cashback promotions (wallet credit on delivery) | ✅ |
| Affiliate tracking | ✅ |

### Product Experience (PDP)

| Feature | Status |
|---|---|
| Image zoom on hover/pinch | ✅ |
| Size chart per category | ✅ |
| Product specifications table | ✅ |
| Product videos | ✅ |
| Verified purchase badge on reviews | ✅ |
| Review helpfulness voting | ✅ |
| Customer Q&A (user questions + answers) | ✅ |
| Product comparison | ✅ |
| Wishlist | ✅ |
| Social sharing (Web Share API) | ✅ |

### Post-Purchase

| Feature | Status |
|---|---|
| Order tracking | ✅ |
| Exchange flow (swap product) | ✅ |
| Delivery feedback / rating | ✅ |
| Return initiation | ✅ |
| Refund status tracking | ✅ |
| Abandoned cart recovery (email) | ✅ |

### User & Auth

| Feature | Status |
|---|---|
| JWT auth (15m access, refresh) | ✅ |
| Account lockout after 5 failed logins | ✅ |
| Refresh token revocation on password change | ✅ |
| Multiple address management | ✅ |
| In-app notification center | ✅ |
| Dark mode | ✅ |

### Admin & Operations

| Feature | Status |
|---|---|
| Admin dashboard with analytics | ✅ |
| Maker-checker refund approvals (ADMIN reviews CS_AGENT requests) | ✅ |
| Fraud risk scoring + blacklist | ✅ |
| Bulk product upload (CSV) | ✅ |
| Analytics reports export (CSV/PDF) | ✅ |
| Audit log on sensitive admin actions | ✅ |
| Multi-warehouse pick lists | ✅ |
| RBAC (SUPER_ADMIN, ADMIN, CS_AGENT roles) | ✅ |

### SEO

| Feature | Status |
|---|---|
| robots.txt | ✅ |
| Canonical URLs on PDP/PLP | ✅ |
| Enhanced JSON-LD (Product, AggregateRating, FAQPage) | ✅ |
| OG tags | ✅ |
| Sitemap | ✅ |

### Frontend UX

| Feature | Status |
|---|---|
| Skeleton loading on all pages | ✅ |
| Infinite scroll on PLP | ✅ |
| Delivery slot picker in checkout | ✅ |
| Postal-code serviceability check (per country) | ✅ |
| Blog / content CMS | ✅ |
| Dark mode | ✅ |

---

## Why ShopVerse?

### Compared to other open-source commerce platforms

Medusa, Saleor, Vendure, and WooCommerce are all capable. ShopVerse's wedge is **enforced correctness** + **batteries-included operations** + a **region-pluggable kernel**.

| Capability | ShopVerse | Medusa.js | WooCommerce | Magento | Saleor |
|---|---|---|---|---|---|
| **DB-enforced financial invariants** | 13, tested | No | No | No | No |
| **Double-entry wallet ledger** | Built-in | No | Plugin | No | No |
| **Race-safe inventory (conditional `UPDATE`)** | Built-in | Partial | No | No | Partial |
| **Multi-warehouse routing** | Built-in | Plugin | No | Built-in | Built-in |
| **Region packs (tax/payment/locale)** | Built-in | No | No | No | No |
| **Pluggable tax + gateway per region** | Built-in | Plugin | Plugin | Plugin | Custom |
| **Fraud scoring + maker-checker refunds** | Built-in | No | No | No | No |
| **Plugin kernel w/ circuit-breaker isolation** | Built-in | Modules | `$hooks` | Modules | Apps |
| **Tests against a real DB** | 1,180+ | Unit only | Manual | Manual | 500+ |
| **TypeScript end-to-end** | ✅ | ✅ | No | No | ✅ |

### Correctness you can't get by accident

This is the moat. For high-AOV and complex-fulfillment stores, one oversold item or one double-refund is real money:

- **Overselling is impossible by construction.** Every inventory mutation is a conditional `UPDATE ... WHERE (stock - reserved) >= qty` — the WooCommerce race-condition bug class can't happen.
- **Money can't vanish.** A double-entry wallet ledger enforces `∑(WalletTransaction.signedAmount) == Wallet.balance` at the DB level. No phantom credits.
- **No double-charges or double-refunds.** Idempotent payments/refunds via unique gateway-ref constraints + refund-request-before-credit.
- **State machines are guarded.** No order jumps PLACED → DELIVERED; every transition is explicit.
- **13 invariants — documented, tested, and enforced.** See [SYSTEM_DESIGN_FINAL.md](SYSTEM_DESIGN_FINAL.md) §2.

### Global by design

ShopVerse runs anywhere — configured per store, extended per region:

- **Single-currency-per-store** with correct minor-unit handling (JPY/KWD as well as USD/EUR/INR) and `Intl`-based display.
- **Region packs** swap regional tax, payment, address, and locale behavior as plugins: `shopverse-india` (flat GST) and `shopverse-us` (per-state sales tax) ship today; with none enabled the kernel uses store-configured defaults.
- **Pluggable payment gateways** — Stripe by default; regional gateways (Razorpay, Mercado Pago, …) register via the `PaymentGatewayStrategy` contract.
- **No hardcoded geography** — currency, country, locale, tax rate, and shipping are all store config, not kernel constants.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Next.js 15 Frontend               │
│  (shop)/ · (auth)/ · admin/ · profile/ · wallet/    │
└──────────────────┬──────────────────────────────────┘
                   │ REST API
┌──────────────────▼──────────────────────────────────┐
│               NestJS 11 Backend                      │
│  38 modules · JWT + passport · Helmet + CSP          │
│  BullMQ (background jobs) · Redis (cache/locks)      │
└──────────────────┬──────────────────────────────────┘
                   │ Prisma 6
┌──────────────────▼──────────────────────────────────┐
│           PostgreSQL 16                              │
│  54+ models · GIN indexes · tsvector FTS             │
│  Conditional UPDATE guards · Unique constraints      │
└─────────────────────────────────────────────────────┘
```

**38 backend modules**: abandoned-cart, admin, affiliate, analytics, auth, blog, brands, cart, categories, coupons, delivery, email, exchange, experience, faqs, flash-sales, fraud, inventory, invoices, legal, loyalty, notifications, orders, payments, price-alerts, price-history, products, qa, referral, reviews, support, users, volume-discounts, wallet, warehouse, webhooks, wishlist + common infrastructure.

Full architecture: [SYSTEM_DESIGN_FINAL.md](SYSTEM_DESIGN_FINAL.md) (33 sections — state machines, invariants, API contracts, data model, security threat model).

### Order Lifecycle

```mermaid
stateDiagram-v2
    direction LR
    [*] --> PLACED
    PLACED --> CONFIRMED : payment intent created
    CONFIRMED --> PACKED : warehouse picks
    PACKED --> SHIPPED : carrier collected
    SHIPPED --> DELIVERED : delivery confirmed
    PLACED --> CANCELLED : cancelled before payment
    CONFIRMED --> CANCELLING : cancel requested
    CANCELLING --> CANCELLED : refund processed
    DELIVERED --> RETURN_REQUESTED : return initiated
    RETURN_REQUESTED --> RETURN_APPROVED : admin approves
    RETURN_APPROVED --> RETURN_RECEIVED : warehouse receives
    RETURN_RECEIVED --> RETURN_RESTOCKED : inventory restored
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend framework | NestJS 11, TypeScript |
| ORM | Prisma 6 |
| Database | PostgreSQL 16 |
| Frontend | Next.js 15, React 19, Tailwind CSS |
| State management | Zustand |
| Auth | JWT (passport-jwt), NextAuth (frontend) |
| Payments | Stripe 11, COD, internal Wallet |
| Background jobs | BullMQ + Redis 7 |
| Email | Nodemailer (SMTP) |
| Testing | Jest (backend integration), Playwright (E2E) |
| Deployment | Docker / Docker Compose |

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 16
- Redis 7 (optional — enables BullMQ queues)

### Install

```bash
git clone https://github.com/vivironycrazy/shopverse.git
cd shopverse

cd backend && npm install
cd ../frontend && npm install
```

### Configure

**Recommended — scaffold env + store config for your market** with
[`create-shopverse-store`](packages/create-shopverse-store):

```bash
npx create-shopverse-store "Acme Outfitters" --currency=USD --country=US --locale=en-US
# non-US example:
# npx create-shopverse-store "Mumbai Mart" --currency=INR --country=IN --locale=en-IN --region=india --render
```

It writes `backend/.env` (a dev-ready `JWT_SECRET` generated, secrets as
`REPLACE_ME`), `frontend/.env.local` (your currency/locale baked in),
`store.config.json`, and a `STORE_SETUP.md` checklist — optionally Railway
/ Render deploy blueprints. Then fill in the `REPLACE_ME` secrets.

Or set the variables by hand. Minimum required:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/shopverse?connection_limit=30"
JWT_SECRET="a-long-random-secret"
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
```

### Database setup

```bash
npx prisma migrate deploy --schema prisma/schema
npx prisma generate --schema prisma/schema
```

### Run

```bash
# Backend (http://localhost:3001)
cd backend && npm run start:dev

# Frontend (http://localhost:3000)
cd frontend && npm run dev
```

---

## Observability

Production-grade observability is built in, off by default, and opt-in
per layer:

- **OpenAPI / Swagger UI** at `/api/docs` (BasicAuth-gated in production).
  Spec at `/api/docs-json` is consumable by Postman / Insomnia / SDK generators.
- **OpenTelemetry tracing** to any OTLP-compatible collector
  (Jaeger / Tempo / Datadog / Honeycomb). HTTP, Prisma, Redis, BullMQ
  jobs, and the hourly invariant validator crons are all auto-traced.
  Log lines carry `trace_id` + `span_id` for log↔trace correlation.
- **Sentry** for 5xx error capture (PII scrubbed before transmit).
  Configured for error-only — we use OTel for traces.
- **Prometheus** `/api/metrics` endpoint (BasicAuth-gated in production)
  with request duration histogram, error counter, and cron-execution counter.

Enable each by setting its env var — see [`QUICKSTART.md`](QUICKSTART.md#observability-optional)
for the local Jaeger one-liner and the full config matrix.

### Telemetry

ShopVerse sends **anonymous, opt-out** usage telemetry: a daily heartbeat with a
random install id, version, store *config* (currency/country/region/locale), and a
coarse revenue *band* — no personal data, no exact numbers, no customer records.
It exists to count active installs and to warn stores approaching the $100k/yr
license threshold. Turn it off with `SHOPVERSE_TELEMETRY_DISABLED=1` (or the
universal `DO_NOT_TRACK=1`). The full payload and guarantees are documented in
[`docs/TELEMETRY.md`](docs/TELEMETRY.md).

---

## Testing

```bash
# All 724 backend integration tests (requires PostgreSQL)
cd test && npx jest --runInBand --forceExit

# Single test file
cd backend && npx jest path/to/spec

# Frontend E2E (requires running dev server + seeded DB)
cd frontend && npx playwright test
```

Tests run against a real PostgreSQL database — no mocks for DB queries. Redis connection errors are non-blocking in test mode (BullMQ noise only).

---

## User Guide

### For Shoppers

**Browse & search**: Use the top search bar for full-text search with autocomplete. Filter by brand, category, price, size, and color on the product listing page. Sort by relevance, price, or rating.

**Cart & checkout**: Add items to cart → select delivery slot → choose address → apply coupon or wallet balance → pay (Stripe card, COD, or wallet). Cart reservations are held for 15 minutes — complete checkout before they expire.

**Orders**: Track your order from "Placed" through "Confirmed → Packed → Shipped → Delivered". Cancel before shipping. Return within 7 days of delivery. Refunds go to wallet (instant) or original payment method (1-3 business days for card).

**Wallet & loyalty**: Earn loyalty points on every delivery. Redeem against future orders. Refer friends for wallet credit. Wallet balance is always shown at checkout for easy split-payment.

**Flash sales**: Flash sale prices are time-limited. Reserve your item — the price is locked for 15 minutes even if the sale ends during checkout.

### For Store Admins

**Products**: Create products with multiple variants (size/color), images, videos, specifications, and size charts. Bulk upload via CSV for catalog imports.

**Inventory**: Set stock per warehouse. The system automatically routes orders to the best warehouse, or splits across warehouses when needed.

**Orders**: View all orders, manage fulfillment, mark shipped with tracking code. CANCELLING orders are flagged — refunds require explicit approval.

**Refunds**: CS agents raise refund requests. Admins (with maker-checker) approve. Approved refunds execute automatically — to wallet (instant) or Stripe (async).

**Analytics**: Revenue by date range, order counts, average order value, top products, discount usage. Export as CSV or PDF.

**Fraud**: Every order is scored before placement. High-risk orders are auto-flagged. Blacklisted users/emails are blocked.

---

## Deployment

Four supported deployment targets, picked by where you are in the
scale + ops-complexity spectrum:

| Target | Best for | Time-to-first-request | Doc |
|---|---|---|---|
| **Docker Compose** | Local dev, single-VM prod, demos | 2–5 min | [`docker-compose.yml`](docker-compose.yml) |
| **Ansible** | Single-VM production on rented hardware | 15–30 min | [`ansible/`](ansible/) |
| **Helm (Kubernetes)** | Multi-pod production, GitOps, autoscale | 30 min first time | [`docs/deployment/helm.md`](docs/deployment/helm.md) |
| **Raw K8s manifests** | Learning K8s, GitOps without Helm | 30 min | [`docs/deployment/kubernetes.md`](docs/deployment/kubernetes.md) |

### Quick start — Docker Compose

```bash
docker compose up -d
docker exec shopverse-backend npx prisma migrate deploy --schema=../prisma/schema
```

### Quick start — Helm

```bash
helm install shopverse ./helm/shopverse \
  --namespace shopverse --create-namespace \
  --values helm/shopverse/values.production.example.yaml
```

### Worker process split (production)

By default the API container also runs the BullMQ consumers — simplest
deployment, no extra moving parts. For production at scale, split workers
into their own pods so they scale independently of the API:

- **Docker Compose:** uncomment the `worker` service block in
  `docker-compose.yml` and set `DISABLE_WORKERS=true` on the backend.
- **Helm:** set `workers.enabled: true` (backend gets `DISABLE_WORKERS`
  automatically).
- **Raw K8s:** the manifests in `k8s/` ship the split topology by default.

### Production checklist

- Set `NODE_ENV=production`
- Set `CORS_ORIGIN` to your domain
- Enable HTTPS (Ingress + cert-manager, or nginx/cloud LB)
- Set Redis password (`requirepass`)
- Set `connection_limit=30` in `DATABASE_URL`
- Revoke `CREATE ON SCHEMA public` from DB app user
- Configure `STRIPE_WEBHOOK_SECRET` from the Stripe Dashboard
- Wire observability env vars (`SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`,
  `METRICS_BASIC_AUTH`) — see [QUICKSTART.md](QUICKSTART.md#observability-optional)

### Load testing

[`bench/`](bench/) ships k6 scripts for the 5 hottest endpoints (products
list, cart add, order place, wallet credit, order detail). Operator-run
against a deployment, not CI-gated — see [`bench/README.md`](bench/README.md).

---

## Project Structure

```
backend/src/
  auth/           JWT, login, register, lockout
  products/       Catalog, search (FTS), autocomplete, facets
  cart/           Cart items, reservation service
  orders/         Order lifecycle, cancellation, price drift validation
  payments/       Stripe integration, webhook handler, reconciliation
  inventory/      WarehouseInventory mutations, reserve/consume/release
  warehouse/      Routing, pick lists, RTO, multi-WH split
  wallet/         Ledger, credit/debit, balance cap
  loyalty/        Earn, redeem, clawback, tiers
  refunds/        (via orders + admin) RefundRequest → gateway execution
  fraud/          Risk scoring, blacklist, pre-order checks
  coupons/        Coupon CRUD, validation, atomic usage increment
  flash-sales/    Flash sale lifecycle, per-user cap
  notifications/  In-app notification center
  exchange/       Product exchange flow
  price-alerts/   Price drop alert subscriptions
  price-history/  Price snapshot + chart data
  volume-discounts/ Tiered quantity discounts
  blog/           CMS for content marketing
  analytics/      Revenue, orders, top products
  admin/          Dashboard, maker-checker, audit log, export
  ...

frontend/src/app/
  (shop)/         Products, cart, checkout, orders, returns
  (auth)/         Login, register
  admin/          Admin dashboard pages
  profile/        Account, addresses, orders, wallet, loyalty
  wallet/         Wallet balance + transactions
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

Quick start: fork → branch → code → `cd backend && npx tsc --noEmit` → PR.

---

## Building plugins

ShopVerse is a modular monolith with a plugin contract — kernel
(non-removable) + core-extended strategies + fully pluggable
extensions. First-party plugins ship in this repo: feature plugins
(`price-alerts`, `blog`, `price-history`, `volume-discounts`,
`notifications`) and **region packs** (`shopverse-india` — flat GST;
`shopverse-us` — per-state sales tax) that swap regional tax/payment/
locale behavior via the strategy contracts. The kernel loads them
through [`backend/plugins.config.ts`](backend/plugins.config.ts) at boot.

| You want to... | Read |
|---|---|
| Build your first plugin in 10 min | [docs/plugins/tutorial.md](docs/plugins/tutorial.md) |
| Catalog of first-party plugins | [docs/plugins/index.md](docs/plugins/index.md) |
| Full author guide | [docs/plugins/guide.md](docs/plugins/guide.md) |
| Every hook / event / strategy / slot | [docs/plugins/sdk-reference.md](docs/plugins/sdk-reference.md) |
| Performance budgets + CI gates | [docs/plugins/performance.md](docs/plugins/performance.md) |
| Slot taxonomy + a11y + i18n | [slots](docs/plugins/slots.md) · [a11y](docs/plugins/a11y.md) · [i18n](docs/plugins/i18n.md) |
| Lint rules + PR template | [docs/plugins/conventions.md](docs/plugins/conventions.md) |
| Failure isolation + audit | [failure-model](docs/plugins/failure-model.md) · [security](docs/plugins/security.md) |

The plugin model is documented at the architectural level under
[docs/architecture/](docs/architecture/) (kernel boundary, scope,
first-party plugin catalog). Plan reference: the architecture
evolution programme that delivered the plugin model is captured in
`waves/` and `cross-cutting/COMPLETENESS_MATRIX.md` (run
`npx shopverse audit:completeness` to see programme state).

---

## Documentation

| Document | Purpose |
|---|---|
| [QUICKSTART.md](QUICKSTART.md) | Get running in 10 minutes |
| [SYSTEM_DESIGN_FINAL.md](SYSTEM_DESIGN_FINAL.md) | Full architecture reference (state machines, invariants, threat model) |
| [docs/plugins/](docs/plugins/) | Plugin author docs (tutorial, guide, SDK reference, conventions) |
| [docs/architecture/](docs/architecture/) | Kernel boundary, scope, plugin catalog |
| [MASTER_TRACKER.md](MASTER_TRACKER.md) | Implementation status and launch readiness |
| [ROADMAP.md](ROADMAP.md) | What's coming next |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contributor guide |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting |
| [GOVERNANCE.md](GOVERNANCE.md) | Decision-making and maintainers |
| [COMMERCIAL_USAGE.md](COMMERCIAL_USAGE.md) | What counts as commercial use |
| [PARTNERS.md](PARTNERS.md) | Agency / consultancy partner program |
| [BOUNTIES.md](BOUNTIES.md) | Get paid to build region packs, gateways, features |

---

## License

ShopVerse is **source available** under the [Business Source License 1.1 (BSL)](LICENSE).

| Use | License |
|---|---|
| Learning, dev, evaluation, non-commercial, contributions | ✅ Free under BSL |
| **Production store under $100k/yr GMV** | ✅ **Free** — keep the "Powered by ShopVerse" badge |
| Production store at/above $100k/yr GMV | 💳 [Commercial](COMMERCIAL_USAGE.md) |
| Removing the badge (white-label) | 💳 [Commercial](COMMERCIAL_USAGE.md) |
| SaaS / managed hosting of ShopVerse for others | 💳 [Commercial](COMMERCIAL_USAGE.md) |

Each released version also converts to **Apache 2.0** three years after publication.

Commercial licensing: **vivironycrazy@gmail.com** · See [COMMERCIAL_USAGE.md](COMMERCIAL_USAGE.md) for pricing.

Copyright © 2026 Vivek Negi. All rights reserved.
