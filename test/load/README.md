# ShopVerse Load & Chaos Tests (PHASE-7)

## Prerequisites

```bash
# k6 (load generator)
choco install k6          # Windows
# or: brew install k6     # Mac

# toxiproxy (chaos injection)
docker run -d -p 8474:8474 -p 5433:5432 ghcr.io/shopify/toxiproxy
```

## Scripts

| Script | VUs | Duration | What it tests |
|---|---|---|---|
| `k6-plp.js` | 1000 | 5 min | PLP endpoint, p95 < 150ms cached |
| `k6-checkout.js` | 500 | 10 min | Full checkout flow, no oversell |
| `k6-flash.js` | 2000 | 60s | Flash sale burst, exactly N fulfillments |
| `chaos-pg-kill.sh` | 100 | 2 min | 30% PG packet loss during checkout |

## Setup

1. Start backend: `cd backend && npm run start:dev`
2. Seed at least one product with stock >= 5000
3. Note the `variantId` from the seed

## Running

```bash
# PLP (no setup needed — reads existing products)
k6 run test/load/k6-plp.js

# Checkout (needs VARIANT_ID)
k6 run -e VARIANT_ID=123 test/load/k6-checkout.js

# Flash sale (needs a flash-sale-enabled variant)
k6 run -e VARIANT_ID=456 test/load/k6-flash.js

# Chaos (needs toxiproxy + DATABASE_URL pointing to proxy port 5433)
bash test/load/chaos-pg-kill.sh
```

## Post-run verification

```bash
cd test && npx jest invariants.spec.ts --runInBand
```

This runs I-1/I-2/I-3/I-7/I-8/I-9 checks against the database after load.

## Acceptance criteria

- `k6-plp.js`: p95 < 150ms, error rate < 1%
- `k6-checkout.js`: p95 < 2s for full flow, orders_placed + stock_rejections == total iterations
- `k6-flash.js`: reserve_success == stock count (e.g. 100 for stock=100)
- `chaos-pg-kill.sh`: I-1/I-2 invariants hold after chaos, no orphaned reservations
