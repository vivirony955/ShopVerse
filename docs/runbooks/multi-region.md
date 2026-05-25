# Runbook — Multi-region deployment

This runbook documents the architecture and operational practices for
running ShopVerse across two or more geographic regions. The current
default deployment is single-region; multi-region is a deliberate
expansion that introduces consistency tradeoffs you must accept.

**Status:** Reference architecture. Not yet validated on a production
deployment. Treat this as a design starting point, not a turnkey recipe.

---

## When to go multi-region

You probably **don't need** multi-region until at least one of these is
true:

- Your customer base spans timezones where the latency from a single
  region exceeds 200ms p99 to a measurable share of users.
- A single-region failure (cloud-provider AZ outage) is unacceptable for
  your business SLA.
- You have regulatory requirements that demand data residency in a
  specific country.
- Your warehouses are physically split across regions and you want each
  warehouse's admin staff to write to a local database for latency.

If none of these apply, stay single-region. Multi-region adds operational
complexity that takes weeks of incident-response practice to internalize.

---

## Topology

```
                       ┌─────────────────────────┐
                       │   Global edge (CDN)     │
                       │   Static assets only    │
                       └────────────┬────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                                           │
   ┌──────────▼──────────┐                   ┌────────────▼─────────┐
   │  Region A (primary) │                   │  Region B (secondary)│
   │                     │                   │                      │
   │  API instances      │                   │  API instances       │
   │  Worker (leader)    │                   │  Worker (follower)   │
   │  Postgres (primary) │◄──── streaming ───┤  Postgres (replica)  │
   │  Redis              │      replication  │  Redis               │
   └─────────────────────┘                   └──────────────────────┘
```

**Key choices:**

- **Single Postgres primary.** All writes go to Region A. Reads can be
  served from either region's replica (with explicit `read-your-writes`
  exceptions — see below).
- **Async streaming replication.** Replicas lag by ~50–500ms typical,
  occasionally seconds under load. The application MUST tolerate this.
- **Redis per region.** Not replicated. Used only for caches, rate
  limits, and cron locks — never for state that must survive a region
  failover.
- **Worker leader election.** Exactly one region runs scheduled jobs at
  a time. See "Cron leader election" below.

---

## Read-your-writes consistency

Some operations cannot tolerate read-replica lag:

- A customer who just placed an order must immediately see it in their
  order list.
- An admin who just approved a refund must see it as approved.
- A wallet credit must reflect in the user's balance instantly.

For these, route reads to the **primary** for the session that did the
write. Two strategies:

1. **Sticky sessions** (simpler): after a write, set a cookie that pins
   the user to the primary region for N seconds (e.g. 30s — longer than
   typical replication lag).
2. **Selective primary reads** (better): the application explicitly
   marks specific endpoints as primary-only.

We recommend strategy 2. Endpoints already known to need primary reads:
`GET /orders/me`, `GET /wallet/me`, `GET /refunds/me`, anything
`POST`-then-immediately-`GET`.

---

## Cron leader election

The hourly `InvariantValidatorService` and other scheduled jobs MUST
run in exactly one region at a time. Running them concurrently in both
regions risks double-billing (e.g., loyalty point grants), duplicate
emails, and conflicting writes.

**Mechanism:** Redis-based lock with a short TTL.

```
Every minute, both regions attempt:
  SETNX cron:leader region-a 60s

  If success → I am leader for next 60s → run scheduled jobs
  If failed  → I am follower → skip scheduled jobs

Renew with SET key value XX PX 60000 every 30s.
```

The existing `CronLockService` already implements this pattern locally.
For multi-region, point both regions' lock service at a shared Redis
(typically the primary region's Redis with a cross-region private
connection).

**Failure mode:** If the primary region goes down mid-lock, the lock
expires after 60s and the secondary region takes over. There is at most
60s of cron downtime per failover.

---

## Failover procedure

### Planned failover (testing)

1. Drain traffic from Region A via DNS / load balancer (set weight to 0).
2. Wait until in-flight requests complete (~30s).
3. Promote Region B's Postgres replica to primary using `pg_promote()`.
4. Update Region A's Postgres to follow Region B (it's now the standby).
5. Restore traffic via DNS to Region B.

Total downtime if practiced: 60–90 seconds.

### Unplanned failover (Region A is gone)

1. Confirm Region A is unreachable (not just slow). Wait at least 3
   minutes to avoid split-brain on transient connectivity issues.
2. Promote Region B replica.
3. Update DNS to route all traffic to Region B.
4. **Critical:** when Region A comes back, do NOT let it accept writes.
   It will have stale data. Either:
   - Resync it as a replica from Region B, or
   - Take it permanently offline and rebuild.

Failing to do step 4 is the single most common cause of multi-region
data corruption.

---

## What replicates and what doesn't

| Resource | Replication mechanism | Lag tolerance |
|---|---|---|
| Postgres | Streaming replication (async) | 50–500ms typical |
| Object storage (S3, R2) | Provider-native (typically eventual) | seconds-minutes |
| Redis | None — region-local only | n/a |
| BullMQ queues | Run in primary region only | n/a |
| Stripe webhooks | Route to primary region only (configure in Stripe dashboard) | n/a |
| Email (BullMQ jobs) | Primary region only | n/a |

**Why no Redis replication?** Caches can be cold-rebuilt from Postgres.
Locks expire automatically. Rate-limit counters are best-effort. Adding
Redis replication adds complexity for low value.

---

## Cost of multi-region

Conservatively, expect:

- **2× compute cost** (you're running both regions at near-full capacity).
- **+30–50% Postgres cost** (replica + cross-region replication
  bandwidth).
- **+10–20% engineering time** indefinitely (every change must be tested
  against replication-lag scenarios).

If your business is doing less than $1M ARR, the cost rarely justifies
the resilience. Stay single-region until volume forces the issue.

---

## What this runbook does NOT cover

- Multi-master Postgres (we don't support it; the consistency story breaks).
- Truly geo-partitioned data (customer-X-lives-in-region-Y data residency).
- Multi-cloud (this runbook assumes a single cloud provider with multiple
  regions).
- Active-active read+write topologies.

If you need any of those, this runbook is the wrong starting point. Talk
to the maintainer about commercial consulting.

---

## Deployment vehicle

The recommended way to deploy each region is the Helm chart at
[`helm/shopverse/`](../../helm/shopverse/). Per-region values files differ
on:

- `ingress.host` — `shopverse-us.example.com` vs `shopverse-eu.example.com`
- `config.OTEL_SERVICE_NAME` — keep `shopverse-backend` but rely on the
  resource attribute `service.instance.id` (auto-populated from K8s pod
  name) for region disambiguation
- `secrets.DATABASE_URL` — replica DSN in the secondary region; primary
  DSN in the primary region. Application reads use the local replica;
  writes hit the primary (cross-region).
- `workers.enabled: true` only in the primary region (cron-leader election
  ensures exactly one region runs scheduled jobs).

See [`docs/deployment/helm.md`](../deployment/helm.md) for chart-specific
operational guidance (upgrades, rollback, observability wiring).
