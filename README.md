# ShopVerse

**Production-grade Indian D2C ecommerce platform** — open source, commercially licensable.

NestJS 11 · Next.js 15 · PostgreSQL 16 · Prisma 6 · React 19 · Stripe · Tailwind CSS

> Free to use, study, and contribute. Commercial deployment requires a commercial license.  
> See [LICENSE](LICENSE) and [COMMERCIAL_LICENSE.md](COMMERCIAL_LICENSE.md).

---

## What Is ShopVerse?

ShopVerse is a full-stack, multi-warehouse direct-to-consumer ecommerce platform built for the Indian market. It covers the complete commerce lifecycle — from catalog browsing and flash sales through multi-warehouse fulfillment, payment reconciliation, returns, refunds, and loyalty — with a production-quality backend hardened against the security and correctness issues that plague most open-source ecommerce projects.

It is not a toy. The backend has 38 modules, 54+ database models, and 638 integration tests that run against a real PostgreSQL database.

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
| Wallet (internal balance) | ✅ | Double-entry ledger, ₹1L lifetime cap |
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
| Pincode autocomplete (India Post) | ✅ |
| Blog / content CMS | ✅ |
| Dark mode | ✅ |

---

## Why ShopVerse?

### Compared to Other Open-Source Ecommerce Platforms

| Capability | ShopVerse | Medusa.js | WooCommerce | Magento | Saleor |
|---|---|---|---|---|---|
| **India payments (UPI/Razorpay)** | Phase 2 | Plugin | Plugin | Plugin | Custom |
| **Multi-warehouse routing** | Built-in | Plugin | No | Built-in | Built-in |
| **Inventory reservation (cart TTL)** | Built-in | No | No | No | Built-in |
| **Fraud detection** | Built-in | No | Plugin | Plugin | No |
| **Wallet / internal ledger** | Built-in | No | Plugin | No | No |
| **Maker-checker approvals** | Built-in | No | No | No | No |
| **Flash sales (per-user cap)** | Built-in | No | Plugin | Plugin | No |
| **Exchange flow** | Built-in | Partial | Plugin | Plugin | No |
| **Loyalty + clawback on refund** | Built-in | No | Plugin | No | No |
| **Test coverage** | 638 tests (real DB) | Unit only | Manual | Manual | 500+ |
| **Security hardening** | 30 controls (H1+H2) | Basic | WordPress risks | Complex | Good |
| **TypeScript throughout** | ✅ | ✅ | No | No | ✅ |
| **India-first design** | ✅ | ❌ | ❌ | ❌ | ❌ |

### Why It's More Scalable

- **No check-then-act inventory bugs**: All inventory mutations use conditional `UPDATE ... WHERE (stock - reserved) >= qty`. Race-safe by construction.
- **Double-entry wallet ledger**: `∑(WalletTransaction.signedAmount) == Wallet.balance` is enforced at the DB level. No phantom credits.
- **Reservation TTL enforcement**: Cart reservations have an expiry cron — stock doesn't leak from abandoned checkouts.
- **Idempotent webhooks**: `PaymentReconciliation.gatewayRef` unique constraint — Stripe webhooks can fire twice, result is identical.
- **State machine guards**: Every order/payment/shipment/refund transition is explicitly guarded — no status can jump directly to DELIVERED from PLACED.
- **13 invariants**: Documented, tested, enforced. See `ARCHITECTURE.md §2`.
- **Connection pool sized correctly**: `?connection_limit=30` prevents the Prisma default (CPU×2+1) from starving under load.

### India Market Focus

- **COD + Wallet + Stripe** — the three payment methods that cover ~95% of Indian ecommerce
- **Pincode serviceability check** at cart and checkout
- **Delivery slot booking** with warehouse-level availability
- **Flash sales** with per-user quantity caps (common in India — Big Billion Day, etc.)
- **₹-denominated** amounts throughout (extensible to multi-currency)
- **GST-aware** invoice generation
- **Razorpay (UPI/net banking/cards)** — Phase 2, the highest-priority next item

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
git clone https://github.com/your-username/shopverse.git
cd shopverse

cd backend && npm install
cd ../frontend && npm install
```

### Configure

```bash
cp .env.example .env
# Edit .env — fill in DATABASE_URL, JWT_SECRET, STRIPE_SECRET_KEY, SMTP_*
```

Minimum required variables:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/shopverse?connection_limit=30"
JWT_SECRET="a-long-random-secret"
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
```

### Database setup

```bash
npx prisma migrate deploy --schema prisma/schema.prisma
npx prisma generate --schema prisma/schema.prisma
```

### Run

```bash
# Backend (http://localhost:3001)
cd backend && npm run start:dev

# Frontend (http://localhost:3000)
cd frontend && npm run dev
```

---

## Testing

```bash
# All 638 backend integration tests (requires PostgreSQL)
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

```bash
# Docker Compose (backend + frontend + postgres + redis)
docker compose up -d

# Apply migrations
docker exec shopverse-backend npx prisma migrate deploy --schema=../prisma/schema.prisma
```

Production checklist (see [MASTER_TRACKER.md](MASTER_TRACKER.md) §4):
- Set `NODE_ENV=production`
- Set `CORS_ORIGIN` to your domain
- Enable HTTPS (nginx or cloud LB)
- Set Redis password (`requirepass`)
- Set `connection_limit=30` in `DATABASE_URL`
- Revoke `CREATE ON SCHEMA public` from DB app user
- Configure `STRIPE_WEBHOOK_SECRET` from Stripe Dashboard

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

## License

ShopVerse is dual-licensed:

- **Open source** (non-commercial): [GNU Affero General Public License v3.0](LICENSE) — free to use, study, modify, and contribute. If you use ShopVerse in a network-accessible service, you must make your source available under AGPL-3.0.
- **Commercial**: A paid commercial license is available for businesses that need to keep their source proprietary. See [COMMERCIAL_LICENSE.md](COMMERCIAL_LICENSE.md) or email **vivironycrazy@gmail.com**.

Copyright © 2026 Vivek Negi.
