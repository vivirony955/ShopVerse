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

| # | Script | Endpoint | Auth | Expected p95 (local, M2 Mac, postgres in docker) |
|---|---|---|---|---|
| 01 | `01-products-list.js` | `GET /api/products` | none | < 80 ms |
| 02 | `02-cart-add.js` | `POST /api/cart/items` | JWT | < 150 ms |
| 03 | `03-orders-place.js` | `POST /api/orders` | JWT | < 250 ms |
| 04 | `04-wallet-credit.js` | `POST /api/wallet/credit` | JWT (admin) | < 100 ms |
| 05 | `05-orders-detail.js` | `GET /api/orders/:id` | JWT | < 80 ms |

These numbers are reference points from a local dev box. On production-grade
hardware with a tuned Postgres, all five should comfortably halve.

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
