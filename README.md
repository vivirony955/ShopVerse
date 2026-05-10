# ShopVerse

Production-grade Indian D2C ecommerce platform. Full-stack monorepo: NestJS 11 backend + Next.js 15 frontend, targeting the India market.

## What's inside

**Core commerce flow** — cart reservation → order → payment (Stripe/COD/Wallet) → multi-warehouse fulfillment → delivery → return → refund → loyalty clawback. Every transition is guarded by state machines and 13 financial invariants.

**38 backend modules**: auth, products, cart, orders, payments, inventory, warehouse, wallet, loyalty, reviews, coupons, referrals, flash sales, wishlist, fraud detection, analytics, delivery slots, invoices, support tickets, abandoned cart recovery, affiliates, FAQs, and more.

**54+ Prisma models**, 1000+ line schema, squashed migrations baseline.

**638 backend tests** — deep integration tests covering happy paths, edge cases, race conditions, and boundary conditions across the full commerce flow.

## Tech stack

| Layer | Tech |
|---|---|
| Backend | NestJS 11, TypeScript, Prisma 6, PostgreSQL 16 |
| Frontend | Next.js 15, React 19, TailwindCSS, Zustand |
| Auth | JWT (15m access token, passport-jwt), NextAuth on frontend |
| Payments | Stripe, COD, internal Wallet ledger |
| Queue | BullMQ + Redis (optional, for background jobs) |
| Testing | Jest (backend integration), Playwright (E2E) |

## Project layout

```
backend/src/           NestJS modules (one folder per domain)
frontend/src/app/      Next.js app router pages
  (shop)/              Products, cart, checkout, orders
  (auth)/              Login, register
prisma/
  schema.prisma        54+ models
  migrations/          Squashed baseline + incremental migrations
test/                  Backend integration test suite (638 tests)
```

## Getting started

### Prerequisites

- Node.js 20+
- PostgreSQL 16
- Redis (optional — enables BullMQ queues and caching)

### Environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Required variables (see `.env.example` for the full list):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Access token signing key |
| `STRIPE_SECRET_KEY` | Stripe payments |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Transactional email |

Frontend reads `NEXT_PUBLIC_API_URL` from `frontend/.env` — create it manually pointing at your backend (e.g. `http://localhost:3001`).

### Install and run

```bash
# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Apply database migrations
npx prisma migrate deploy --schema prisma/schema.prisma

# Generate Prisma client
npx prisma generate --schema prisma/schema.prisma

# Start backend (http://localhost:3001)
cd backend && npm run start:dev

# Start frontend (http://localhost:3000)
cd frontend && npm run dev
```

### Run the test suite

```bash
cd test && npx jest --runInBand --forceExit
```

All 638 tests run against a real PostgreSQL database. Redis is optional — BullMQ connection errors are non-blocking in test mode.

## Key design decisions

- **Inventory**: `WarehouseInventory` is the authoritative stock source. `Variant.stock` is a write-through cache updated in the same transaction as every WI mutation.
- **Reservations**: Cart items are reserved before checkout, with a TTL enforced by a cron job. `placeOrder` consumes the reservation atomically.
- **Wallet**: Double-entry ledger with `WalletTransaction` rows. Every refund creates a `RefundRequest` row before crediting (invariant I-11).
- **Fraud**: Pre-order risk scoring with auto-flag and blacklist. Score factors: failed payments, chargebacks, address mismatch.
- **Multi-warehouse**: Orders route to the single best warehouse, or split across warehouses when no single warehouse can fulfill the full order.

## Contributing

1. Fork the repo and create a branch from `main`.
2. Make your changes — run `cd backend && npx tsc --noEmit` before committing.
3. Add tests for new backend logic (`test/` directory, Jest + real DB).
4. Open a pull request with a clear description of what and why.

See [SYSTEM_DESIGN_FINAL.md](SYSTEM_DESIGN_FINAL.md) for the full architecture reference (state machines, invariants, API contracts, data model).

## License

MIT — see [LICENSE](LICENSE).
