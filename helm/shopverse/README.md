# ShopVerse Helm Chart

Source-available under the [Business Source License 1.1](../../LICENSE).
Repository: https://gitlab.com/aiexperts/ecommWeb

## TL;DR

```bash
helm repo add shopverse https://aiexperts.gitlab.io/ecommweb/helm   # when published
helm install shopverse shopverse/shopverse \
  --namespace shopverse --create-namespace \
  --values values.production.example.yaml \
  --set-string secrets.JWT_SECRET=... \
  --set-string secrets.JWT_REFRESH_SECRET=... \
  --set-string secrets.STRIPE_SECRET_KEY=... \
  --set-string secrets.STRIPE_WEBHOOK_SECRET=... \
  --set-string secrets.DATABASE_URL=... \
  --set-string secrets.REDIS_URL=...
```

Until the chart is published to a registry, install from the source tree:

```bash
git clone https://gitlab.com/aiexperts/ecommWeb
cd ecommWeb/helm
helm install shopverse ./shopverse --namespace shopverse --create-namespace \
  --values shopverse/values.production.example.yaml
```

## Architecture

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│ Ingress     │──→│ Frontend    │   │ Backend     │
│ /  → fe     │   │ (Next.js)   │   │ (NestJS API)│
│ /api → be   │───────────────────→ │             │
└─────────────┘                     │ DISABLE_    │
                                    │ WORKERS=    │
                                    │ {{workers.  │
                                    │  enabled}}  │
                                    └──────┬──────┘
                                           │
                       ┌───────────────────┴────────┐
                       │                            │
                  ┌────▼──────┐               ┌─────▼─────┐
                  │ Worker    │ (optional)    │ Postgres  │
                  │ Pod(s)    │               │ + Redis   │
                  │ — BullMQ  │               │ (external)│
                  └───────────┘               └───────────┘
```

The chart renders **3 deployables**:

- **Backend** (`{{ release }}-backend`) — REST API on port 3001, plus crons,
  Swagger, Prometheus metrics, and (when `workers.enabled=false`) the
  BullMQ consumers.
- **Worker** (`{{ release }}-worker`) — opt-in. Same image, different
  `command`. Pure BullMQ consumer, no HTTP API. Exposes health + Prometheus
  metrics on port 9091.
- **Frontend** (`{{ release }}-frontend`) — Next.js standalone runner on
  port 3000.

Plus: ConfigMap, Secret (optional), ServiceAccount, Services, optional
Ingress, optional HPAs, optional PDBs, optional NetworkPolicies, and a
**pre-install/pre-upgrade Job** running `prisma migrate deploy`.

**Postgres and Redis are external by default** — you bring your own (managed
RDS / Cloud SQL / ElastiCache / Memorystore / self-hosted in another
namespace).

## Values reference

See [`values.yaml`](values.yaml) for the full annotated list. The most
common overrides:

| Key | Default | When to change |
|---|---|---|
| `image.backend.repository` | `registry.gitlab.com/aiexperts/ecommweb/backend` | Always — point at your registry |
| `image.backend.tag` | `""` (uses Chart.AppVersion) | Pin a specific build for repeatable rollouts |
| `backend.replicaCount` | `2` | Increase for traffic, decrease for dev clusters |
| `workers.enabled` | `false` | Set `true` once order volume warrants worker isolation (~1k orders/day) |
| `autoscaling.backend.enabled` | `false` | Production: yes. Dev: no. |
| `ingress.enabled` | `false` | Production: yes |
| `ingress.host` | `shopverse.example.com` | Your DNS name |
| `ingress.tls.enabled` | `false` | Production: yes (paired with cert-manager) |
| `secrets.external` | `false` | `true` if using SealedSecrets / ExternalSecrets / Vault |
| `migrations.enabled` | `true` | `false` only if you manage migrations out-of-band |
| `networkPolicy.enabled` | `false` | `true` if your CNI supports NetworkPolicy enforcement |

## Secrets management

Three patterns supported:

### 1. SealedSecrets / ExternalSecrets / Vault (recommended)

Create the Secret out-of-band, then point the chart at it:

```yaml
secrets:
  external: true
  existingSecretName: shopverse-prod-secrets
```

### 2. --set-string at install time

```bash
helm install shopverse ./shopverse \
  --set-string secrets.JWT_SECRET=$(openssl rand -hex 32) \
  --set-string secrets.STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY \
  ...
```

### 3. Inline values.yaml (NOT recommended for production)

Acceptable only for ephemeral dev clusters; values.yaml ends up in git.

## Required Secret keys

When `secrets.external=true`, the named K8s Secret must contain:

| Key | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✓ | Postgres connection string |
| `JWT_SECRET` | ✓ | Access token signing |
| `JWT_REFRESH_SECRET` | ✓ | Refresh token signing |
| `STRIPE_SECRET_KEY` | ✓ | Stripe API |
| `STRIPE_WEBHOOK_SECRET` | ✓ | Stripe webhook signature verification |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` | ✓ | Transactional email |
| `REDIS_URL` | ✓ (workers split) | BullMQ + cache |
| `SENTRY_DSN` | — | Error tracking (off if unset) |
| `METRICS_BASIC_AUTH` | — | `/api/metrics` gate (`user:pass` format) |
| `SWAGGER_USER` `SWAGGER_PASS` | — | `/api/docs` gate in prod |

## Upgrading

```bash
# Pin to a specific version, get a dry-run diff first
helm diff upgrade shopverse ./shopverse --values prod.yaml

# Upgrade
helm upgrade shopverse ./shopverse --values prod.yaml \
  --set image.backend.tag=v0.2.0

# Watch the rollout
kubectl rollout status -n shopverse deploy/shopverse-backend
```

The pre-upgrade migration Job runs `prisma migrate deploy`. If migrations
fail the upgrade is aborted — no new ReplicaSet rolls out. Roll back with:

```bash
helm rollback shopverse
```

**Caveat:** Prisma migrations are forward-only. A `helm rollback` does NOT
revert the schema. Mitigation: only ship additive migrations (new columns
nullable, no drops) until your next major version.

## Verification

```bash
helm lint shopverse
helm template shopverse ./shopverse --values shopverse/values.production.example.yaml | kubectl apply --dry-run=client -f -
helm install shopverse ./shopverse --dry-run --debug
```

## Uninstall

```bash
helm uninstall shopverse --namespace shopverse
# The migration job + ConfigMap + (in-chart) Secret are deleted.
# Data on external Postgres / Redis is preserved.
# Externally-managed Secret resource is NOT touched.
```
