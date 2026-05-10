# ShopVerse — Quick Start Guide

Get a working ShopVerse instance running in under 10 minutes.

---

## Option A: Docker (Recommended)

**Prerequisites:** Docker + Docker Compose

```bash
git clone https://github.com/vivironycrazy/shopverse.git
cd shopverse

# Copy and configure environment
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET and STRIPE_SECRET_KEY

# Start everything (PostgreSQL + Redis + Backend + Frontend)
docker compose up -d

# Apply migrations and seed sample data
docker exec shopverse-backend npx prisma migrate deploy --schema=../prisma/schema.prisma
```

Access:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- API docs: http://localhost:3001/api (if Swagger enabled)

Default credentials (after seeding):
- Admin: admin@shopverse.dev / admin123
- Customer: customer@shopverse.dev / customer123

---

## Option B: Manual Setup

**Prerequisites:** Node.js 20+, PostgreSQL 16, Redis 7 (optional)

### 1. Clone and install

```bash
git clone https://github.com/vivironycrazy/shopverse.git
cd shopverse

cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in at minimum:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/shopverse?connection_limit=30"
JWT_SECRET="generate-a-random-32-char-string-here"
JWT_REFRESH_SECRET="another-random-32-char-string-here"
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your@email.com"
SMTP_PASS="your-app-password"
```

Generate JWT secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Set up the database

```bash
# Create the database
createdb shopverse

# Apply all migrations
npx prisma migrate deploy --schema prisma/schema.prisma

# Generate Prisma client
npx prisma generate --schema prisma/schema.prisma
```

### 4. Start the servers

```bash
# Terminal 1 — Backend (http://localhost:3001)
cd backend && npm run start:dev

# Terminal 2 — Frontend (http://localhost:3000)
cd frontend && npm run dev
```

### 5. Verify

Backend health check:
```bash
curl http://localhost:3001/health
# → { "status": "ok" }
```

---

## Running Tests

```bash
# All 638 backend integration tests (requires PostgreSQL running)
cd test && npx jest --runInBand --forceExit

# Single test file
cd backend && npx jest path/to/spec.ts

# Frontend E2E (requires running dev server + seeded DB)
cd frontend && npx playwright test
```

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Access token signing key (min 32 chars) |
| `JWT_REFRESH_SECRET` | ✅ | Refresh token signing key |
| `STRIPE_SECRET_KEY` | ✅ | Stripe secret key (use test key for dev) |
| `STRIPE_WEBHOOK_SECRET` | ✅ | Stripe webhook endpoint secret |
| `SMTP_HOST` | ✅ | Email server hostname |
| `SMTP_PORT` | ✅ | Email server port (usually 587) |
| `SMTP_USER` | ✅ | Email username |
| `SMTP_PASS` | ✅ | Email password or app password |
| `SMTP_FROM` | ✅ | From address for transactional email |
| `REDIS_URL` | ⚡ Optional | Enables BullMQ queues (recommended for prod) |
| `CORS_ORIGIN` | 🚀 Prod | Frontend URL for CORS (required in production) |
| `NODE_ENV` | 🚀 Prod | Set to `production` in production |

---

## Common Issues

**PostgreSQL connection refused**
→ Ensure PostgreSQL is running: `pg_isready` or `brew services start postgresql@16`

**`JWT_SECRET` startup error**
→ The secret must be at least 32 characters. Generate one: `openssl rand -base64 32`

**Redis `ECONNREFUSED` in test output**
→ Non-blocking — BullMQ tries to connect but falls back gracefully. Tests still pass.

**`CORS_ORIGIN` guard throws at startup in dev**
→ Only enforced in `NODE_ENV=production`. In dev, set `NODE_ENV=development` or omit it.

**Prisma migration drift**
→ If `prisma migrate dev` detects drift, run `prisma migrate resolve --applied <migration-id>` to mark the baseline as applied.

---

## Next Steps

- [ARCHITECTURE.md](SYSTEM_DESIGN_FINAL.md) — Full system design (state machines, invariants, data model)
- [MASTER_TRACKER.md](MASTER_TRACKER.md) — Feature implementation status
- [CONTRIBUTING.md](CONTRIBUTING.md) — How to contribute
- [COMMERCIAL_USAGE.md](COMMERCIAL_USAGE.md) — License and commercial usage
