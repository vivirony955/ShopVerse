# Deployment — Helm

Deploy ShopVerse to a Kubernetes cluster using the bundled Helm chart at
[`helm/shopverse/`](../../helm/shopverse/).

For the full chart reference (every value, every annotation), see the
chart's own [`README.md`](../../helm/shopverse/README.md). This guide
covers end-to-end install + day-2 operations.

## Prerequisites

- Kubernetes 1.27 or newer
- Helm 3.13+
- An ingress controller (NGINX, Traefik, etc.)
- Managed Postgres 16 (RDS / Cloud SQL / DigitalOcean Managed DB)
- Managed Redis 7 (ElastiCache / Memorystore / Upstash)
- A container registry your cluster can pull from
- `cert-manager` for TLS (optional but recommended)
- A CNI that enforces NetworkPolicy if you plan to enable `networkPolicy.enabled`

The chart does NOT include Postgres or Redis subcharts. Bring your own —
production deployments always use managed services. See the [Helm chart
README](../../helm/shopverse/README.md#secrets-management) for connection
string format.

## First install — 5 minutes

```bash
# 1. Create the namespace + the Secret holding your real credentials.
kubectl create namespace shopverse
kubectl create secret generic shopverse-secrets -n shopverse \
  --from-literal=DATABASE_URL="postgresql://shopverse:..." \
  --from-literal=JWT_SECRET="$(openssl rand -hex 32)" \
  --from-literal=JWT_REFRESH_SECRET="$(openssl rand -hex 32)" \
  --from-literal=STRIPE_SECRET_KEY="sk_live_..." \
  --from-literal=STRIPE_WEBHOOK_SECRET="whsec_..." \
  --from-literal=SMTP_HOST="smtp.resend.com" \
  --from-literal=SMTP_PORT="465" \
  --from-literal=SMTP_USER="resend" \
  --from-literal=SMTP_PASS="re_..." \
  --from-literal=SMTP_FROM="noreply@shopverse.example.com" \
  --from-literal=REDIS_URL="rediss://default:...@redis.upstash.io:6379"

# 2. Install.
helm install shopverse ./helm/shopverse \
  --namespace shopverse \
  --values helm/shopverse/values.production.example.yaml \
  --set image.backend.tag=v0.1.0 \
  --set image.frontend.tag=v0.1.0 \
  --set ingress.host=shopverse.example.com \
  --set frontend.publicBackendUrl=https://shopverse.example.com

# 3. Wait for rollout to finish.
kubectl rollout status -n shopverse deploy/shopverse-backend
kubectl rollout status -n shopverse deploy/shopverse-worker
kubectl rollout status -n shopverse deploy/shopverse-frontend
```

The pre-install Hook runs `prisma migrate deploy` BEFORE any pod rolls
out. If migrations fail, no deployment happens — your old version stays
intact. Watch:

```bash
kubectl logs -n shopverse -l app.kubernetes.io/component=migration -f
```

## Architecture choices the chart makes for you

| Decision | Reason |
|---|---|
| Backend + worker share the same image | Single build path, one set of vulns to patch, no drift |
| Worker is a SEPARATE Deployment (when `workers.enabled=true`) | Independent scaling, resource isolation, separate rollout |
| Backend gets `DISABLE_WORKERS=true` automatically when workers are enabled | Prevents duplicate job processing |
| Migrations run as a Helm hook Job | Atomic — no half-migrated state, no app rollout on failure |
| External Secrets recommended (`secrets.external=true`) | Production-grade — never commit secrets to git |
| Liveness + readiness probes split | Probe failures don't terminate pods that are processing requests |
| `terminationGracePeriodSeconds: 60` on workers | BullMQ in-flight jobs get time to drain before SIGKILL |

## Upgrade procedure

```bash
# 1. (Recommended) Get a diff first
helm diff upgrade shopverse ./helm/shopverse \
  --values helm/shopverse/values.production.example.yaml \
  --set image.backend.tag=v0.2.0

# 2. Apply
helm upgrade shopverse ./helm/shopverse \
  --values helm/shopverse/values.production.example.yaml \
  --set image.backend.tag=v0.2.0 \
  --set image.frontend.tag=v0.2.0 \
  --atomic --timeout 5m

# --atomic ensures Helm rolls back automatically if anything fails.
```

The pre-upgrade Hook runs migrations first. If they fail, NO pods restart.

## Rollback

```bash
helm history shopverse -n shopverse
helm rollback shopverse 2 -n shopverse   # roll back to revision 2
```

**Caveat: Prisma migrations are forward-only.** A `helm rollback` does NOT
revert schema changes. Mitigation: only ship additive migrations between
minor versions. See [`docs/runbooks/multi-region.md`](../runbooks/multi-region.md)
for the broader upgrade-safety policy.

## Scaling

### Manual

```bash
kubectl scale deploy/shopverse-backend -n shopverse --replicas=5
kubectl scale deploy/shopverse-worker  -n shopverse --replicas=3
```

### Automatic (HPA)

Set in your values file:

```yaml
autoscaling:
  backend: { enabled: true, minReplicas: 3, maxReplicas: 10, targetCPUUtilizationPercentage: 70 }
  worker:  { enabled: true, minReplicas: 2, maxReplicas: 8, targetCPUUtilizationPercentage: 70 }
```

HPA requires `metrics-server` running in the cluster (`kubectl top pods`
must work).

## Observability

The chart leaves observability OFF by default — flip it on by populating
optional Secret keys + ConfigMap values:

```yaml
config:
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector.observability:4318"
  OTEL_TRACES_SAMPLER_ARG: "0.1"
  SENTRY_ENVIRONMENT: production

# In the Secret:
#   SENTRY_DSN, METRICS_BASIC_AUTH (for /api/metrics scrape)
```

Workers emit traces under `service.name=shopverse-worker`; the API under
`service.name=shopverse-backend`. Filter accordingly in Jaeger/Tempo.

Prometheus scrape for `/metrics`:

```yaml
# In your ServiceMonitor or PodMonitor:
endpoints:
  - port: http
    path: /api/metrics
    interval: 30s
    basicAuth:
      username: { name: shopverse-secrets, key: METRICS_USER }
      password: { name: shopverse-secrets, key: METRICS_PASS }
```

(For the worker, the `/metrics` endpoint is on port `worker-http` /9091.)

## Day-2 operations

| Task | Command |
|---|---|
| Tail backend logs | `kubectl logs -n shopverse -l app.kubernetes.io/component=backend -f --max-log-requests=10` |
| Tail worker logs | `kubectl logs -n shopverse -l app.kubernetes.io/component=worker -f` |
| Drain a node safely | Standard `kubectl drain` — PDBs keep at least N replicas up |
| Run an ad-hoc migration | `kubectl create job --from=job/shopverse-migrate adhoc-migrate -n shopverse` |
| Exec into the backend | `kubectl exec -it -n shopverse deploy/shopverse-backend -- sh` |
| Check Helm release | `helm status shopverse -n shopverse` |

## Uninstall

```bash
helm uninstall shopverse -n shopverse
kubectl delete namespace shopverse   # nuke remaining ConfigMaps + jobs
```

External Postgres and Redis are NOT touched. Externally-managed Secrets
are NOT deleted.

## Validation

Always do these before merging a chart change:

```bash
helm lint helm/shopverse
helm template shopverse helm/shopverse \
  --values helm/shopverse/values.production.example.yaml | \
  kubectl apply --dry-run=client -f -
```

CI runs both automatically on every PR (see `.github/workflows/ci.yml`).
