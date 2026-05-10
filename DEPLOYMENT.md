# ShopVerse — Deployment & Release Plan

Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).  
See [LICENSE](LICENSE) for terms.

---

## 1. Environments

| Environment | Purpose | Branch | URL |
|---|---|---|---|
| **Local dev** | Development and unit testing | any | `localhost:3000` / `localhost:3001` |
| **Staging** | Pre-production validation, QA, E2E tests | `main` | `staging.shopverse.dev` |
| **Production** | Live traffic | tagged release (`v*`) | `shopverse.dev` |

Environment promotion: `local → staging → production`. No direct-to-production deploys.

---

## 2. Infrastructure Requirements

| Component | Version | Notes |
|---|---|---|
| **PostgreSQL** | 16 | Primary datastore. `connection_limit=30` in DATABASE_URL |
| **Redis** | 7 | BullMQ queues (abandoned cart, email, flash sales). Optional in dev, required in prod |
| **Node.js** | 20 LTS | Backend runtime |
| **Docker** | 24+ | Container runtime |
| **Docker Compose** | v2 | Local + staging orchestration |

**Minimum server specs (production, single node):**
- 4 vCPU, 8 GB RAM, 50 GB SSD
- Separate PostgreSQL instance recommended for production (RDS, Supabase, or self-managed)

---

## 3. Environment Variables

All required variables are documented in [QUICKSTART.md](QUICKSTART.md) and [.env.example](.env.example).

**Production-critical (must be set before deploy):**

```env
DATABASE_URL="postgresql://user:pass@host:5432/shopverse?connection_limit=30"
JWT_SECRET="<min 32 chars, cryptographically random>"
JWT_REFRESH_SECRET="<min 32 chars, cryptographically random>"
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
CORS_ORIGIN="https://shopverse.dev"
NODE_ENV="production"
REDIS_URL="redis://host:6379"
SMTP_HOST="smtp.resend.com"
SMTP_PORT="465"
SMTP_USER="resend"
SMTP_PASS="<resend API key>"
SMTP_FROM="noreply@shopverse.dev"
```

Generate secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 4. Pre-Deploy Checklist

Run before every staging and production deployment:

- [ ] All 638 integration tests pass: `cd test && npx jest --runInBand --forceExit`
- [ ] TypeScript compiles clean: `cd backend && npx tsc --noEmit`
- [ ] Prisma schema valid: `npx prisma validate --schema prisma/schema.prisma`
- [ ] ESLint clean: `cd backend && npm run lint`
- [ ] `.env` variables verified (no placeholder values)
- [ ] Migration SQL reviewed (if schema changed)
- [ ] Rollback plan documented (for this deploy)
- [ ] Staging deploy tested and signed off

---

## 5. Deployment Steps

### 5.1 Docker Compose (Staging / Single-Node Production)

```bash
# 1. Pull latest code
git pull origin main           # staging
git checkout v1.0.0            # production (always deploy a tagged release)

# 2. Build images
docker compose build --no-cache

# 3. Apply database migrations (zero-downtime — additive only)
docker compose run --rm backend \
  npx prisma migrate deploy --schema=../prisma/schema.prisma

# 4. Rolling restart (zero-downtime if behind a load balancer)
docker compose up -d --no-deps backend
docker compose up -d --no-deps frontend

# 5. Verify
curl -s http://localhost:3001/health | grep '"status":"ok"'
```

### 5.2 Health Checks

```bash
# Backend
curl http://localhost:3001/health
# Expected: { "status": "ok", "db": "connected", "timestamp": "..." }

# Frontend
curl -I http://localhost:3000
# Expected: HTTP/1.1 200 OK

# Database connectivity
docker compose exec backend npx prisma db execute --stdin \
  --schema=../prisma/schema.prisma <<< "SELECT 1;"
```

### 5.3 Kubernetes (Production Scale)

For production deployments beyond single-node, use the following structure:

```yaml
# Recommended resource limits (backend pod)
resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 2000m
    memory: 1Gi

# Recommended replica count
replicas: 3          # minimum for HA
strategy: RollingUpdate
maxSurge: 1
maxUnavailable: 0    # zero-downtime
```

**Database:** Use a managed PostgreSQL (AWS RDS, Supabase, Neon) — do not run PostgreSQL inside a pod in production.

**Migrations in Kubernetes:** Run as a Job before the Deployment rollout:
```yaml
# migration-job.yaml
command: ["npx", "prisma", "migrate", "deploy", "--schema=../prisma/schema.prisma"]
```

---

## 6. Database Migration Strategy

### Safe migrations (zero-downtime)
These can be applied without a maintenance window:
- Adding nullable columns (no backfill required)
- Adding new tables
- Adding indexes (`CREATE INDEX CONCURRENTLY`)
- Adding constraints on empty tables

### Unsafe migrations (require maintenance window or multi-step)
- Adding NOT NULL columns to existing tables → add nullable first, backfill, then add constraint
- Renaming columns → use shadow column strategy (add new, dual-write, backfill, switch, drop old)
- Dropping columns/tables → deprecate in code first, deploy, then drop in next release
- Changing column types → always multi-step

### Invariant preservation during migrations
Before any migration touching Order, Wallet, WarehouseInventory, or Payment tables:
1. Verify all 13 invariants hold pre-migration: run invariant validator cron manually
2. Apply migration
3. Verify all 13 invariants hold post-migration

---

## 7. Rollback Procedures

### Application rollback (immediate, < 2 minutes)
```bash
# Rollback to previous container image
docker compose up -d --no-deps backend --scale backend=0
git checkout v1.0.0-prev
docker compose build backend
docker compose up -d --no-deps backend
```

### Database rollback
**ShopVerse uses additive-only migrations in production.** Rollback is column/table deprecation, not deletion.

If a migration must be reversed:
1. Write a compensating migration (never edit applied migration files)
2. Apply the compensating migration
3. Verify invariants after rollback

**Emergency rollback (data-at-risk):**
1. Put site in maintenance mode (503 from nginx/load balancer)
2. Take PostgreSQL point-in-time snapshot
3. Restore from last known-good snapshot
4. Redeploy previous application version
5. Verify invariants
6. Remove maintenance mode

### Partial failure handling
If deploy fails mid-rollout (rolling deploy):
- Old pods continue serving traffic — users are unaffected
- Fix the issue, re-tag, re-deploy
- Do NOT force-kill old pods during investigation

---

## 8. Release Process

### 8.1 Versioning

Follows [Semantic Versioning](https://semver.org/):

| Change | Version bump | Example |
|---|---|---|
| Bug fix, security patch | PATCH | `1.0.0 → 1.0.1` |
| New feature, backward compatible | MINOR | `1.0.0 → 1.1.0` |
| Breaking API change, license change | MAJOR | `1.0.0 → 2.0.0` |

**Pre-release tags:** `v1.5.0-rc.1`, `v1.5.0-beta.1`

### 8.2 Release Checklist

**1. Code freeze (T-3 days):**
- [ ] All planned PRs merged to `main`
- [ ] No failing CI on `main`
- [ ] MASTER_TRACKER.md updated with completed features
- [ ] ROADMAP.md updated (move completed items, add next milestone)

**2. Release candidate (T-2 days):**
- [ ] Tag RC: `git tag v1.5.0-rc.1 && git push origin v1.5.0-rc.1`
- [ ] Deploy RC to staging
- [ ] Run full test suite on staging
- [ ] Run k6 load tests (`test/load/k6-checkout.js`, `k6-flash.js`, `k6-plp.js`)
- [ ] Manual smoke test: register → browse → cart → checkout → order → refund flow
- [ ] Sign off: maintainer approval required

**3. Production release (T-0):**
- [ ] Write CHANGELOG entry (see §8.3)
- [ ] Tag release: `git tag v1.5.0 && git push origin v1.5.0`
- [ ] Deploy to production (§5.1)
- [ ] Verify health checks pass
- [ ] Monitor error rates for 30 minutes post-deploy
- [ ] GitHub/GitLab release notes published

**4. Post-release:**
- [ ] Announce on relevant channels (GitHub Discussions, LinkedIn)
- [ ] Update QUICKSTART.md if setup steps changed
- [ ] Archive closed milestone

### 8.3 Changelog Format

```markdown
## [v1.5.0] — 2026-08-01

### Added
- Razorpay UPI integration (F2-01) — supports UPI, net banking, cards
- Social login via Google OAuth 2.0 (F2-05)

### Changed
- Order cancellation now supports partial cancellation for split shipments

### Fixed
- Wallet balance drift on concurrent refund + loyalty clawback (#42)

### Security
- JWT token version bump invalidates all sessions on password change

### Breaking
- `POST /orders` response shape: `paymentIntentId` renamed to `gatewayRef`
  Migration: update all clients reading `paymentIntentId` field
```

### 8.4 Hotfix Process

For critical bugs or security patches discovered in production:

```bash
# Branch from the release tag, not main
git checkout -b hotfix/wallet-drift v1.0.0

# Fix, test locally
cd test && npx jest wallet --runInBand --forceExit

# Tag as patch
git tag v1.0.1
git push origin v1.0.1

# Deploy to production immediately (skip staging for P0 security patches)
# Merge back to main after deploy
git checkout main
git merge hotfix/wallet-drift
git push origin main
```

**Hotfix criteria (P0 — skip staging):**
- Wallet balance manipulation or money loss
- Authentication bypass
- Inventory oversell in production
- Any vulnerability in SECURITY.md scope

**Hotfix criteria (P1 — staging required):**
- Order state machine stuck (cannot progress)
- Payment webhook failing silently
- Data export producing incorrect data

---

## 9. Monitoring & Alerting

### 9.1 Key Metrics to Watch Post-Deploy

| Metric | Normal | Alert threshold |
|---|---|---|
| HTTP 5xx rate | < 0.1% | > 1% for 5 min |
| DB connection pool usage | < 70% (21/30) | > 90% (27/30) |
| Prisma query latency p95 | < 100ms | > 500ms |
| BullMQ queue depth | < 100 jobs | > 1000 jobs |
| Cart reservation cron | Runs every 5 min | Not run in 15 min |
| Invariant validator cron | Runs every 1h | Violation detected |

### 9.2 Log Signals

```
# Healthy deploy — watch for these in first 30 min:
[OrdersService] Order placed successfully
[PaymentsService] Payment intent created
[InventoryService] Reservation committed

# Red flags — investigate immediately:
[InvariantValidator] VIOLATION DETECTED — I-1
[WalletService] Balance mismatch
[PaymentsService] Webhook signature verification failed
```

### 9.3 Database Health

```sql
-- Check active connections (run if pool saturation suspected)
SELECT count(*), state FROM pg_stat_activity 
WHERE datname = 'shopverse' GROUP BY state;

-- Check for long-running transactions (> 30s = potential lock)
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - pg_stat_activity.query_start > interval '30 seconds';

-- Verify invariant I-3 (wallet balance = sum of transactions)
SELECT w.id, w.balance, SUM(wt."signedAmount") AS computed
FROM "Wallet" w
LEFT JOIN "WalletTransaction" wt ON wt."walletId" = w.id
GROUP BY w.id, w.balance
HAVING w.balance != COALESCE(SUM(wt."signedAmount"), 0);
-- Must return 0 rows
```

---

## 10. Security Operations

### 10.1 Secrets Rotation

| Secret | Rotation frequency | Impact on rotation |
|---|---|---|
| `JWT_SECRET` | 90 days | All access tokens invalidated — users re-login |
| `JWT_REFRESH_SECRET` | 180 days | All refresh tokens invalidated — users re-login |
| `STRIPE_SECRET_KEY` | On compromise only | Update webhook endpoint on Stripe dashboard |
| `SMTP_PASS` | 180 days | Non-disruptive |
| Database password | 180 days | Brief connection pool reset |

**JWT rotation procedure (zero-disruption):**
1. Add `JWT_SECRET_PREV` env var pointing to old secret
2. Update auth service to verify against both secrets
3. Deploy
4. Set new `JWT_SECRET`
5. Deploy (old tokens still valid via `JWT_SECRET_PREV`)
6. After 15 minutes (access token TTL), remove `JWT_SECRET_PREV`
7. Deploy

### 10.2 Dependency Auditing

```bash
# Run before every release
cd backend && npm audit --audit-level=high
cd frontend && npm audit --audit-level=high

# Fix high/critical vulnerabilities before tagging release
npm audit fix
```

Dependabot is configured (`.github/dependabot.yml`) to auto-create PRs for security updates.

---

## 11. Disaster Recovery

### 11.1 RTO / RPO Targets

| Scenario | RTO | RPO |
|---|---|---|
| Application crash (OOM, panic) | < 2 min | 0 (stateless) |
| Database corruption | < 4 hours | < 1 hour (with hourly snapshots) |
| Full server loss | < 8 hours | < 1 hour |
| Datacenter outage | < 24 hours | < 1 hour |

### 11.2 Backup Strategy

**Database:**
- Continuous WAL archiving (pgBackRest or managed service equivalent)
- Daily full snapshots, retained 30 days
- Point-in-time recovery (PITR) to any second in the last 7 days

**Application state:** Stateless — no additional backup needed.

**Secrets:** Store in a secrets manager (AWS Secrets Manager, Vault, or 1Password Teams). Not in git.

### 11.3 Recovery Runbook

1. **Assess:** Determine scope (application only vs database vs both)
2. **Communicate:** Post status in incident channel; notify affected commercial licensees
3. **Isolate:** Put site in maintenance mode to prevent further damage
4. **Restore:** Database PITR to last known-good point
5. **Verify:** Run invariant checks; confirm financial data integrity
6. **Resume:** Remove maintenance mode; monitor
7. **Post-mortem:** Within 48 hours, document root cause and prevention

---

## 12. Commercial Licensee Notifications

Per [GOVERNANCE.md](GOVERNANCE.md): critical changes require advance notice to commercial licensees.

| Change type | Notice period | Channel |
|---|---|---|
| Breaking API change | 30 days | GitHub release notes + email |
| License change | 90 days | GitHub issue + email |
| End-of-support (major version) | 180 days | GitHub issue + email |
| Security patch (apply immediately) | 0 days | SECURITY.md disclosure |

Contact list for commercial licensees: maintained privately by maintainer (vivironycrazy@gmail.com).
