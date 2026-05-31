# ShopVerse — k6 Load Tests

Performance test scripts for the five hottest backend endpoints. Used to
catch regressions, validate scaling, and document baseline expectations.

These scripts are **operator-run**, not CI-gated. CI doesn't have a stable
baseline to compare against (latency depends on machine, DB warm-up, etc.),
so we don't fail builds on numeric thresholds. Each script documents its
expected p95 in a header comment — operators run them against a deployment
and verify the numbers haven't regressed.

## Prerequisites

- [k6 0.50+](https://k6.io/docs/get-started/installation/)
- A running ShopVerse backend (default target: `http://localhost:4000`)
- A seeded database with at least 50 products and 1 admin user
- Bash (for `run-all.sh`)

Install k6 on macOS: `brew install k6`. On Linux: see the k6 docs.

## Quick start

```bash
# Set the base URL (defaults to http://localhost:4000)
export BASE_URL=http://localhost:4000

# Run a single scenario
k6 run 01-products-list.js

# Run everything sequentially with a consolidated summary
./run-all.sh
```

## What's tested

| # | Script | Endpoint | Auth | VU peak | Expected p95 |
|---|---|---|---|---|---|
| 01 | `01-products-list.js` | `GET /api/products` | none | 100 | < 80 ms |
| 02 | `02-cart-add.js` | `POST /api/cart/items` | JWT | 100 | < 150 ms |
| 03 | `03-orders-place.js` | `POST /api/orders` | JWT | 50 | < 250 ms |
| 04 | `04-wallet-credit.js` | `POST /api/wallet/credit` | JWT (admin) | 100 | < 100 ms |
| 05 | `05-orders-detail.js` | `GET /api/orders/:id` | JWT | 100 | < 80 ms |
| 06 | `06-scale-10k.js` | `GET /api/products` | none | **10 000** | < 500 ms |

Reference numbers are from a local dev box (M2 Mac, postgres in docker).
On production-grade hardware with a tuned Postgres, scenarios 01–05 should
comfortably halve their p95. Scenario 06 is a stress test — see below.

### Scenario 06 — 10k-VU stress test

Scenarios 01–05 verify "is the steady-state fast?" Scenario 06 verifies
"does it stay UP at burst scale?" — homepage spike during a flash sale,
SEO crawl pile-up, or coordinated marketing campaign.

The thresholds are deliberately looser than the steady-state ones:

| Metric | 01–05 cap | 06 cap | Rationale |
|---|---|---|---|
| `http_req_failed` | < 1 % | < 2 % | Rate-limiter + circuit-breaker fire on purpose at saturation |
| `http_req_duration` p(95) | per script | < 500 ms | Tail latency rises naturally with queue depth |
| `http_req_duration` p(99) | — | < 2000 ms | Hard cap — anything slower = saturation collapse, not gracefully degraded |

**Generator infrastructure (where k6 runs):**

| VU count | k6 host minimum | Notes |
|---|---|---|
| 100 | 1 core / 1 GB | The 01–05 default. Local dev box is fine. |
| 1 000 | 2 cores / 2 GB | Still single-machine, still local-dev viable. |
| 10 000 | 4 cores / 8 GB | macOS / Linux only; Windows ulimit issues above ~5k. |
| > 10 000 | k6 Cloud or distributed | A single k6 process tops out ≈ 30k VUs per 8-core host. |

**Target infrastructure (the backend being tested):**

A 10k-VU run with `sleep(0.5–1.5)` produces ~5k–10k req/s sustained. To
absorb that:

- Postgres: ≥ 4 cores, `max_connections ≥ 300`, `connection_limit ≥ 200`
  in the backend DATABASE_URL. The pool size is the most common
  bottleneck at this VU level.
- Redis: warmed PLP cache (≥ 80 % hit rate expected). Cold Redis at
  10k VUs cascades into a Postgres DDoS within ~30 s.
- Backend: either horizontally scaled (≥ 4 replicas behind a load
  balancer) OR vertically sized (≥ 8 cores). Single-process Node will
  saturate event-loop lag past ~3k req/s.
- Rate limiter + WAF: known source-IP allow-listed for the duration,
  or thresholds raised temporarily.

**Running 10k against staging or prod:**

```bash
K6_VUS=10000 K6_DURATION=5m BASE_URL=https://staging.shopverse.in \
  k6 run 06-scale-10k.js
```

⚠️ Never run this against production without:
1. Operator approval in advance
2. Source IP allow-listed at the WAF
3. Real-time monitoring dashboard open (Grafana / Prometheus)
4. Pre-agreed abort criteria (e.g. error rate > 5% sustained 30 s)

A 5-min steady at 10k VUs is ~3 million requests. To anyone outside the
test plan, this looks like an attack.

## Workload shape

Each script runs the same staged workload by default:

```
| stage   | duration | VUs |
|---------|----------|-----|
| warmup  | 30s      |  10 |
| ramp-up | 60s      | 100 |
| steady  | 120s     | 100 |
| ramp-dn | 30s      |   0 |
```

Total: ~4 minutes per script, ~20 minutes for the full suite.

Override via env vars:

```bash
K6_VUS=50 K6_DURATION=2m k6 run 01-products-list.js
```

## Interpreting output

k6 prints a summary table after each run. Look for:

- **`http_req_duration` p(95)** — 95th-percentile latency. Compare to the
  baseline in the script header.
- **`http_req_failed`** — error rate. Should be **< 0.5%** on a healthy run.
  Anything higher means the server is overwhelmed (or your DB is starved).
- **`iterations`** — total requests completed. Higher = better throughput.
- **`vus`** — concurrent virtual users. Should match the stage you're in.

A typical bad-day failure mode:

- p95 doubles → server CPU or DB connection pool saturation. Look at the
  shopverse `/api/metrics` `shopverse_http_request_duration_seconds` and
  the Postgres `pg_stat_activity` view simultaneously.
- error rate spikes → either the rate-limiter is firing (HTTP 429) or
  Stripe / Redis is timing out. Filter logs by status code 5xx.

## Seeding a dataset

The scripts assume a non-empty database. Bare minimum:

```bash
# From repo root, with the backend stopped:
cd backend && npm run seed
# Or run the demo seed (when implemented as a good-first-issue):
# cd backend && npm run seed:demo
```

## Running against a remote environment

```bash
BASE_URL=https://staging.shopverse.in k6 run 01-products-list.js
```

Be polite — don't point production-grade load at someone else's environment
without permission. The `steady` stage at 100 VUs is roughly 500–1000
req/s sustained, which will register as an attack on most WAFs.

## Adding a new scenario

1. Copy an existing script and rename it `0N-<endpoint>.js`.
2. Update the `description` and `expected p95` header comment.
3. Import shared helpers from `./lib/`.
4. Add the script name to `run-all.sh`.

## Files

```
bench/
├── README.md           ← this file
├── run-all.sh          ← runs every scenario sequentially
├── lib/
│   ├── auth.js         ← register + login + token cache
│   └── thresholds.js   ← shared SLO definitions
├── 01-products-list.js
├── 02-cart-add.js
├── 03-orders-place.js
├── 04-wallet-credit.js
└── 05-orders-detail.js
```
