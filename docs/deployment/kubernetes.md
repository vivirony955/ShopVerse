# Deployment — Raw Kubernetes manifests

For operators who want plain `kubectl apply -f` without Helm. Use cases:

- Learning K8s shape before adopting Helm
- GitOps with Flux / ArgoCD pointing at a YAML directory
- Single-cluster prototypes
- Air-gapped environments where templating is hard to validate

Files live at [`k8s/`](../../k8s/). For production deployments at scale,
prefer the [Helm chart](./helm.md) — it handles upgrades, hooks, atomic
rollback, and value validation automatically.

## Apply order

The files are numbered. Apply in order with placeholder substitution:

```bash
export NAMESPACE=shopverse
export BACKEND_IMAGE=registry.gitlab.com/aiexperts/ecommweb/backend:v0.1.0
export FRONTEND_IMAGE=registry.gitlab.com/aiexperts/ecommweb/frontend:v0.1.0
export INGRESS_HOST=shopverse.example.com

# 1. Apply namespace + service account
envsubst < k8s/00-namespace.yaml | kubectl apply -f -

# 2. Create the Secret out-of-band (DO NOT commit real values to git)
kubectl create secret generic shopverse-secrets -n shopverse \
  --from-literal=DATABASE_URL="postgresql://..." \
  --from-literal=JWT_SECRET="$(openssl rand -hex 32)" \
  # ... (see helm/shopverse/README.md for the full list)

# 3. Apply ConfigMap
envsubst < k8s/01-configmap.yaml | kubectl apply -f -

# 4. Run migrations FIRST — backend won't start cleanly without them
envsubst < k8s/40-migration-job.yaml | kubectl apply -f -
kubectl wait --for=condition=complete --timeout=300s \
  -n shopverse job/shopverse-migrate

# 5. Apply everything else
for f in k8s/10-* k8s/11-* k8s/12-* k8s/13-* k8s/20-* k8s/30-* k8s/31-*; do
  envsubst < "$f" | kubectl apply -f -
done

# 6. Verify
kubectl get pods -n shopverse -l app.kubernetes.io/instance=shopverse
```

## Differences from the Helm chart

| Feature | Helm | Raw manifests |
|---|---|---|
| Migrations | Auto-runs as a pre-install/upgrade hook | Manual: apply Job, wait for completion, then apply Deployments |
| Worker enabled | `workers.enabled=true` | Always rendered |
| Backend `DISABLE_WORKERS` | Auto-set when worker enabled | Hardcoded `true` (assumes split mode) |
| Ingress TLS | `tls.enabled: true` toggle | Commented-out block — uncomment manually |
| HPA on worker | `autoscaling.worker.enabled: true` | Not included (add manually if needed) |
| NetworkPolicy | `networkPolicy.enabled: true` | Not included (add manually if needed) |
| PDB | `podDisruptionBudget.enabled: true` | Not included (add manually if needed) |
| Atomic rollout | `helm upgrade --atomic` | Manual `kubectl rollout undo` if anything fails |

## Day-2 operations

Same commands as the Helm guide. The deployment names are identical
(`shopverse-backend`, `shopverse-worker`, `shopverse-frontend`).

## When to graduate to Helm

Move to Helm when any of these become true:

- You operate more than one ShopVerse cluster (dev, staging, prod)
- You need automated rollback on migration failure
- Your team has > 3 people who deploy
- You want one source of truth for env-specific configuration
- Your CI / CD pipeline expects a Helm release artifact

Until then, raw manifests are fine — and easier to audit line-by-line.
