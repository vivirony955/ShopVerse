# Contributing to ShopVerse

ShopVerse is licensed under the **Elastic License 2.0 (ELv2)** — source available, free for non-commercial use, commercial use requires a paid license. See [COMMERCIAL_USAGE.md](COMMERCIAL_USAGE.md).

By contributing, you agree that your contributions will be licensed under ELv2 and that you have the right to submit them (DCO sign-off required — see below).

---

## Before You Start

- Read [SYSTEM_DESIGN_FINAL.md](SYSTEM_DESIGN_FINAL.md) §1–2 (Executive Summary + 13 Invariants) before touching financial, inventory, or wallet code.
- Check [MASTER_TRACKER.md](MASTER_TRACKER.md) for current implementation status.
- Check [ROADMAP.md](ROADMAP.md) for planned features.
- **Open an issue first** for anything larger than a bug fix or docs change — discuss the approach before writing code.

---

## Developer Certificate of Origin (DCO)

All commits must be signed off with a DCO statement:

```bash
git commit -s -m "your commit message"
```

This adds `Signed-off-by: Your Name <your@email.com>` to the commit, certifying:

> I certify that this contribution is my original work and I have the right to submit it under the Elastic License 2.0.

PRs without signed-off commits will not be merged.

---

## Development Setup

```bash
git clone https://github.com/vivironycrazy/shopverse.git
cd shopverse

cp .env.example .env
# Fill in: DATABASE_URL, JWT_SECRET, STRIPE_SECRET_KEY (see QUICKSTART.md)

cd backend && npm install
cd ../frontend && npm install

npx prisma migrate deploy --schema prisma/schema.prisma
npx prisma generate --schema prisma/schema.prisma

# Backend (http://localhost:3001)
cd backend && npm run start:dev

# Frontend (http://localhost:3000)
cd frontend && npm run dev
```

See [QUICKSTART.md](QUICKSTART.md) for detailed setup and common issues.

---

## Workflow

1. Fork the repo and create a branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. Make your changes following the conventions below.

3. Run the type checker — **mandatory, zero tolerance for type errors:**
   ```bash
   cd backend && npx tsc --noEmit
   ```

4. Run the full test suite — **all 638 tests must pass:**
   ```bash
   cd test && npx jest --runInBand --forceExit
   ```

5. If you changed `prisma/schema.prisma`:
   ```bash
   npx prisma validate --schema prisma/schema.prisma
   ```

6. Sign your commits (`git commit -s`) and open a PR using the [PR template](.github/PULL_REQUEST_TEMPLATE.md).

---

## Code Conventions

### Backend (NestJS)

- One module per domain: `controller.ts` + `service.ts` + `module.ts` + `dto/` + `*.spec.ts`
- All DB access through `PrismaService` — never instantiate Prisma directly
- Multi-table writes: always `prisma.$transaction(async (tx) => { ... })`. Use `tx` inside, not `this.prisma`
- Throw NestJS exceptions: `NotFoundException`, `BadRequestException`, `ForbiddenException`, `ConflictException`
- Extract `userId` from `@Req() req` — never trust client-sent userId

### Financial & Inventory Code — Mandatory Rules

These areas require extra care. Read `SYSTEM_DESIGN_FINAL.md §2` (invariants) before editing:

| Area | Rule |
|---|---|
| Wallet | Every credit needs a `WalletTransaction` row with unique `reference`. No wallet credit without a prior `RefundRequest` row (invariant I-11). |
| Inventory | Use conditional `WHERE (stock - reserved) >= qty` — never read-then-write. Update `Variant` cache in the same transaction as `WarehouseInventory`. |
| State machines | Check the canonical state machine (§5.1 Order, §6.1 Payment, §8.1 Shipment, §9.3 Refund) before adding/changing transitions. Invalid transitions must throw. |
| Idempotency | Use DB unique constraints + catch `P2002`. Never application-level dedup. |
| Race conditions | Any two concurrent operations on shared state must be atomic. No check-then-act patterns. |

Financial code PRs **require maintainer approval** regardless of CODEOWNERS auto-assignment.

### Frontend (Next.js)

- App router only — no Pages router
- Tailwind CSS for styling — no inline styles except dynamic values
- Zustand for global state; `useQuery`/`useMutation` for server state
- Images through `next/image`

### Schema Changes

1. Edit `prisma/schema.prisma`
2. `npx prisma validate --schema prisma/schema.prisma`
3. `npx prisma generate --schema prisma/schema.prisma`
4. `npx prisma migrate dev --schema prisma/schema.prisma --name descriptive-name`
5. Review the generated SQL — verify it's correct and has a safe rollback path
6. Never edit migration files after they've been applied to any environment

### Comments

Default: write no comments. Only add a comment when the **why** is non-obvious: a hidden constraint, a workaround for a specific bug, a subtle invariant. Code that explains itself via naming doesn't need comments.

---

## Writing Tests

Tests live in `test/` and run against a real PostgreSQL database — no DB mocks.

- Import supertest: `import request from 'supertest'` (default import, not `* as`)
- Use `test-utils/` and `helpers/` utilities for creating test users, products, orders
- Cover: happy path + at least one error path + any race condition if the change involves shared state
- For financial code: also trace concurrent execution and partial failure scenarios

---

## PR Review Standards

**Automated checks (CI):** TypeScript, ESLint, all 638 tests, Prisma schema validation

**Manual review focuses on:**
- Does it break any of the 13 invariants?
- Is there any check-then-act pattern?
- Does it follow existing module conventions?
- Are tests meaningful (not just coverage theater)?

PRs that fail CI will not be reviewed until they pass.

---

## Good Contributions

- Bug fixes with a failing test that the fix makes pass
- Phase 2 features from [ROADMAP.md](ROADMAP.md) — especially Razorpay (F2-01) and social login (F2-05)
- Performance improvements backed by a query plan or benchmark
- Accessibility improvements (WCAG 2.1 AA)
- Documentation corrections

## Out of Scope

- Breaking changes to the data model without a migration plan
- Removing safety guards (rate limits, throttles, auth guards)
- Features not aligned with India D2C ecommerce
- Large refactors without a prior [RFC] issue

---

## Questions?

Open a GitHub issue or email vivironycrazy@gmail.com.

**Security vulnerabilities:** Do NOT open a public issue. See [SECURITY.md](SECURITY.md).
