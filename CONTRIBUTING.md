# Contributing to ShopVerse

Thanks for your interest. ShopVerse is open source under AGPL-3.0 for non-commercial use. Commercial use requires a separate license — see [COMMERCIAL_LICENSE.md](COMMERCIAL_LICENSE.md) (coming soon) or email vivironycrazy@gmail.com.

---

## Before You Start

- Read [SYSTEM_DESIGN_FINAL.md](SYSTEM_DESIGN_FINAL.md) §1-2 (Executive Summary + Invariants) before touching any financial or inventory code.
- Check [MASTER_TRACKER.md](MASTER_TRACKER.md) to see what's done, in progress, and planned.
- Open an issue first for anything larger than a bug fix, so the approach can be agreed before you write code.

---

## Development Setup

```bash
git clone https://github.com/your-username/shopverse.git
cd shopverse

cp .env.example .env
# Fill in DATABASE_URL, JWT_SECRET, STRIPE_SECRET_KEY

cd backend && npm install
cd ../frontend && npm install

npx prisma migrate deploy --schema prisma/schema.prisma
npx prisma generate --schema prisma/schema.prisma

cd backend && npm run start:dev   # http://localhost:3001
cd frontend && npm run dev        # http://localhost:3000
```

---

## Workflow

1. Fork the repo and create a branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. Make your changes. Follow the conventions below.

3. Run the type checker — this is non-negotiable:
   ```bash
   cd backend && npx tsc --noEmit
   ```

4. Run the test suite:
   ```bash
   cd test && npx jest --runInBand --forceExit
   ```
   All 638 tests must pass. If your change breaks existing tests, fix the tests or the code — don't skip.

5. If you changed `prisma/schema.prisma`, validate it:
   ```bash
   npx prisma validate --schema prisma/schema.prisma
   ```

6. Open a pull request with a clear title and description explaining **what** changed and **why**.

---

## Code Conventions

### Backend (NestJS)

- One module per domain: `controller.ts` + `service.ts` + `module.ts` + `dto/` + `*.spec.ts`
- All DB access through `PrismaService` — never instantiate Prisma directly
- Multi-table writes: always use `prisma.$transaction(async (tx) => { ... })`
- Use `tx` inside transactions, not `this.prisma`
- Throw NestJS exceptions: `NotFoundException`, `BadRequestException`, `ForbiddenException`, `ConflictException` — never raw `Error` or magic status codes
- Extract `userId` from `@Req() req` — never trust client-sent userId

### Financial / Inventory Code — Extra Rules

These areas require extra care. Read `SYSTEM_DESIGN_FINAL.md §2` (invariants) before editing:

- **Wallet**: Every credit needs a `WalletTransaction` row with a unique `reference`. No credit without a `RefundRequest` row first (invariant I-11).
- **Inventory**: `WarehouseInventory` is authoritative. Use conditional `WHERE (stock - reserved) >= qty` — never read-then-write. Update the `Variant` cache in the same transaction.
- **State machines**: Check the canonical state machine before adding/changing any status transition. Invalid transitions must throw `BadRequestException`.
- **Idempotency**: Use DB unique constraints + catch `P2002`, not application-level dedup.

### Frontend (Next.js)

- App router only — no Pages router
- Tailwind CSS for styling — no inline styles except dynamic values
- Zustand for global state
- `useQuery` / `useMutation` for server state
- Images through `next/image`

### Schema Changes

1. Edit `prisma/schema.prisma`
2. `npx prisma validate --schema prisma/schema.prisma`
3. `npx prisma generate --schema prisma/schema.prisma`
4. `npx prisma migrate dev --schema prisma/schema.prisma --name descriptive-name`
5. Check the generated migration SQL is correct before committing
6. Never edit migration files after they've been applied

---

## Writing Tests

Tests live in `test/` and run against a real PostgreSQL database. No DB mocks.

- Import supertest as `import request from 'supertest'` (default import)
- Use `test-utils/` helpers for creating test users, products, orders
- Cover: happy path + at least one error path + any race condition if relevant
- For financial code: also test concurrent execution and partial failure

---

## What We're Looking For

Good contributions:
- Bug fixes with a reproducing test
- Performance improvements backed by a query plan or benchmark
- Phase 2 features from `MASTER_TRACKER.md` (especially Razorpay, social login, WhatsApp)
- Accessibility improvements (WCAG 2.1 AA)
- Documentation improvements

Out of scope:
- Breaking changes to the data model without a migration plan
- Removing safety checks (rate limits, guards, validation)
- Features not aligned with the India D2C ecommerce use case

---

## Questions?

Open a GitHub issue or email vivironycrazy@gmail.com.
