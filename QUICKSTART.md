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
docker exec shopverse-backend npx prisma migrate deploy --schema=../prisma/schema
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
npx prisma migrate deploy --schema prisma/schema

# Generate Prisma client
npx prisma generate --schema prisma/schema
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

## Observability (optional)

ShopVerse ships with a three-layer observability stack — all off by default,
opt in via env vars. Zero overhead when disabled.

### OpenAPI / Swagger UI

The API spec is generated from controller decorators. In dev it's served
at [http://localhost:4000/api/docs](http://localhost:4000/api/docs) (raw
JSON at `/api/docs-json`) with no auth. In production, set both
`SWAGGER_USER` and `SWAGGER_PASS` to enable behind BasicAuth — leave either
unset and `/api/docs` returns 404.

### Distributed tracing (OpenTelemetry → Jaeger / Tempo / Datadog)

Run a local Jaeger collector + UI:
```bash
docker run -d --name jaeger \
  -p 16686:16686 -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

Set in `.env`:
```bash
OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
OTEL_TRACES_SAMPLER_ARG="1.0"   # 100% sampling in dev
```

Restart the backend, hit an endpoint, then open
[http://localhost:16686](http://localhost:16686) and pick `shopverse-backend`
from the service dropdown. Spans appear for HTTP request → controller →
Prisma queries → BullMQ jobs → cron runs.

Production: set `OTEL_TRACES_SAMPLER_ARG="0.1"` (10%) and point
`OTEL_EXPORTER_OTLP_ENDPOINT` at your collector.

### Error tracking (Sentry)

Set `SENTRY_DSN` in `.env`. PII scrubbing is built in — emails, phones,
addresses, and financial amounts are redacted before leaving the process.
CI sets `SENTRY_RELEASE` to the git SHA on main-branch builds for release
tracking. Sentry is configured for error capture only; we use OTel for
tracing.

### Prometheus metrics

Endpoint: `/api/metrics` (CycloneDX text format).

In dev: open and unauthenticated.
In production: set `METRICS_BASIC_AUTH="user:pass"` to enable. Without it
in production the endpoint returns 503 (fail closed).

Sample scrape config:
```yaml
scrape_configs:
  - job_name: shopverse
    metrics_path: /api/metrics
    basic_auth: { username: metrics, password: <secret> }
    static_configs: [{ targets: ['backend:4000'] }]
```

Built-in metrics include:
- `shopverse_http_request_duration_seconds` (histogram, by method/route/status)
- `shopverse_http_requests_total` (counter)
- `shopverse_http_unhandled_errors_total` (5xx counter, by route)
- `shopverse_cron_executions_total` (by cron name + status: ok/error/violations/skipped)
- Standard process metrics (cpu, memory, event-loop lag) with `shopverse_` prefix.

### Log → trace correlation

When OTel is enabled, every log line emitted by the global `LoggingInterceptor`
includes `trace_id` and `span_id`. Pipe logs into Loki / Datadog and click
through to the matching trace in Jaeger/Tempo.

---

## Production deployment

For deployments beyond a single VM, ShopVerse ships two Kubernetes-native
paths. Both pull the same backend image and run the same binary; only the
deployment shape differs.

### Helm (recommended for production)

The chart at [`helm/shopverse/`](helm/shopverse/) renders backend Deployment,
optional worker Deployment, frontend Deployment, Services, optional Ingress,
HPAs, PDBs, ConfigMap, Secret (or external Secret reference), and a
pre-install/pre-upgrade Job that runs `prisma migrate deploy`.

```bash
helm install shopverse ./helm/shopverse \
  --namespace shopverse --create-namespace \
  --values helm/shopverse/values.production.example.yaml
```

Full guide: [`docs/deployment/helm.md`](docs/deployment/helm.md).

### Raw Kubernetes manifests

For operators who prefer plain `kubectl apply -f` (GitOps with Flux/ArgoCD,
learning K8s, single-cluster prototypes), the same shape is at
[`k8s/`](k8s/) with `envsubst`-friendly placeholders. Full guide:
[`docs/deployment/kubernetes.md`](docs/deployment/kubernetes.md).

### Worker process split

By default the API container runs both the HTTP server AND the BullMQ
consumers — simplest deployment, no extra moving parts. At scale you'll
want to split them into separate pods so workers scale independently:

- **Helm:** set `workers.enabled: true` — backend pod gets `DISABLE_WORKERS=true`
  automatically.
- **Docker Compose:** uncomment the `worker` block in `docker-compose.yml`
  and set `DISABLE_WORKERS=true` on the backend service.
- **Raw K8s:** the manifests in `k8s/` ship the split topology by default.

### Load tests

```bash
# Run the k6 bench against a local dev server:
cd bench && ./run-all.sh

# Or a single scenario:
k6 run bench/01-products-list.js
```

See [`bench/README.md`](bench/README.md) for baselines + interpretation.

---

## Next Steps

- [ARCHITECTURE.md](SYSTEM_DESIGN_FINAL.md) — Full system design (state machines, invariants, data model)
- [MASTER_TRACKER.md](MASTER_TRACKER.md) — Feature implementation status
- [CONTRIBUTING.md](CONTRIBUTING.md) — How to contribute
- [COMMERCIAL_USAGE.md](COMMERCIAL_USAGE.md) — License and commercial usage
