# ShopVerse Integration Tests

Full-stack integration tests covering the backend HTTP API, database constraints, and the frontend API client.

## Prerequisites

- Node.js 18+
- PostgreSQL running (the same instance used by the backend, or a separate test DB)
- Backend `.env` must exist at `../backend/.env`

## Setup

```bash
cd test
npm install
```

## Database

By default the tests **reuse** `DATABASE_URL` from `../backend/.env`.  
**This will wipe all rows** from that database between tests.

To use a dedicated test database (recommended):

1. Create the database:
   ```sql
   CREATE DATABASE shopverse_test;
   ```
2. Uncomment `TEST_DATABASE_URL` in `.env.test`:
   ```env
   TEST_DATABASE_URL=postgresql://postgres:password@localhost:5432/shopverse_test
   ```

## Running Tests

```bash
# All tests (sequential — required for integration tests sharing the NestJS app)
npm test

# With coverage report
npm run test:cov

# A specific suite
npm run test:auth
npm run test:users
npm run test:products
npm run test:cart
npm run test:orders
```

## Test Suites

| File | What it tests |
|------|--------------|
| `auth.spec.ts` | Register, login, refresh token, protected routes |
| `users.spec.ts` | Profile update, address CRUD, default address |
| `products.spec.ts` | List/filter/search, admin CRUD, variants |
| `categories.spec.ts` | List, CRUD (admin), access control |
| `brands.spec.ts` | List, CRUD (admin), access control |
| `cart.spec.ts` | Add/update/remove items, stock validation, clear |
| `wishlist.spec.ts` | Add/remove, duplicate check, cross-user isolation |
| `orders.spec.ts` | Place order, coupon discount, cancel + stock restore, return, admin status |
| `reviews.spec.ts` | CRUD, ownership, admin delete, pagination, avgRating |
| `coupons.spec.ts` | Validate (expired/inactive/limit/min amount), discount calculation, admin CRUD |
| `database.spec.ts` | Prisma constraints, cascades, transactions, unique indexes |
| `frontend-api.spec.ts` | Frontend axios API client functions against live backend |

## Architecture

```
test/
├── helpers/
│   ├── app.ts       # Boots a shared NestJS test app
│   ├── db.ts        # Prisma client + seed helpers (createUser, createProduct…)
│   └── auth.ts      # loginAs() helper
├── setup/
│   ├── env-setup.ts      # Loads .env files before each test file
│   ├── global-setup.ts   # Runs Prisma migrations once before all tests
│   └── global-teardown.ts # Cleans database after all tests
└── *.spec.ts        # One file per domain
```

Each spec boots (or reuses) a single NestJS `INestApplication` instance and calls `cleanDatabase()` in `beforeEach` to isolate tests. Tests run sequentially (`--runInBand`) to avoid port/DB conflicts.
