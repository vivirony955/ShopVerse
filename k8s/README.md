# ShopVerse — Raw Kubernetes manifests

A `kubectl apply -f`-friendly alternative to the [Helm chart](../helm/shopverse/).
Audience: operators who want to read the raw YAML before adopting Helm.

## When to use these vs Helm

- **Helm** — production deployments, repeatable rollouts, automated upgrades.
- **Raw manifests** — learning, single-cluster prototypes, GitOps workflows
  that prefer plain YAML (Flux / ArgoCD without Helm controllers).

The manifests render the same shape as the Helm chart with `workers.enabled=true`
and `ingress.enabled=true` but with **placeholder values** — search for
`__REPLACE_ME__` and substitute via `envsubst` or hand-edit.

## Apply order

The files are numbered. Apply in order:

```bash
# Substitute placeholders (or edit files in place)
export NAMESPACE=shopverse
export BACKEND_IMAGE=registry.gitlab.com/aiexperts/ecommweb/backend:v0.1.0
export FRONTEND_IMAGE=registry.gitlab.com/aiexperts/ecommweb/frontend:v0.1.0
export INGRESS_HOST=shopverse.example.com

# Apply
for f in k8s/*.yaml; do
  envsubst < "$f" | kubectl apply -f -
done
```

## What's here

| File | Purpose |
|---|---|
| `00-namespace.yaml` | Namespace + service account |
| `01-configmap.yaml` | Non-secret env (NODE_ENV, CORS_ORIGIN, OTel endpoint) |
| `02-secret.template.yaml` | Secret skeleton — DO NOT COMMIT WITH REAL VALUES |
| `10-backend-deployment.yaml` | Backend Deployment (HTTP API, with DISABLE_WORKERS=true) |
| `11-backend-service.yaml` | Backend ClusterIP service |
| `12-backend-ingress.yaml` | Backend Ingress for /api |
| `13-backend-hpa.yaml` | HPA: 2–10 replicas on 70% CPU |
| `20-worker-deployment.yaml` | Worker Deployment (BullMQ consumers) |
| `30-frontend-deployment.yaml` | Frontend Deployment (Next.js) |
| `31-frontend-service.yaml` | Frontend ClusterIP service |
| `32-frontend-ingress.yaml` | Frontend Ingress for / |
| `40-migration-job.yaml` | One-shot `prisma migrate deploy` |

## Migrations

Run `40-migration-job.yaml` **before** every backend deployment update.
The Helm chart automates this as a hook; here you do it manually:

```bash
kubectl delete job -n shopverse shopverse-migrate --ignore-not-found
envsubst < k8s/40-migration-job.yaml | kubectl apply -f -
kubectl wait --for=condition=complete --timeout=300s -n shopverse job/shopverse-migrate
```

## Secret management

`02-secret.template.yaml` is a SKELETON. Never commit a real Secret to git.

Production patterns:

- **SealedSecrets** — encrypt the Secret, commit the encrypted blob.
- **ExternalSecrets** — sync from AWS Secrets Manager / Vault / GCP Secret Manager.
- **kubectl create secret** — one-time imperative, document in a runbook.
- **Vault Agent Injector** — sidecar injects secrets as env vars / files.

Example imperative create:

```bash
kubectl create secret generic shopverse-secrets -n shopverse \
  --from-literal=DATABASE_URL='postgresql://...' \
  --from-literal=JWT_SECRET="$(openssl rand -hex 32)" \
  --from-literal=JWT_REFRESH_SECRET="$(openssl rand -hex 32)" \
  --from-literal=STRIPE_SECRET_KEY=sk_live_... \
  --from-literal=STRIPE_WEBHOOK_SECRET=whsec_... \
  --from-literal=SMTP_HOST=smtp.resend.com \
  --from-literal=SMTP_PORT=465 \
  --from-literal=SMTP_USER=resend \
  --from-literal=SMTP_PASS=... \
  --from-literal=SMTP_FROM=noreply@shopverse.example.com \
  --from-literal=REDIS_URL=redis://redis.shopverse:6379
```

## Prerequisites assumed

- Kubernetes 1.27+
- Ingress controller installed (NGINX assumed; adjust `ingressClassName`)
- cert-manager (for TLS) — optional
- External Postgres + Redis (the manifests don't provision them)

## Verification

```bash
kubectl get all -n shopverse -l app.kubernetes.io/instance=shopverse
kubectl logs -n shopverse -l app.kubernetes.io/component=backend -f
kubectl logs -n shopverse -l app.kubernetes.io/component=worker -f
```
