#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# Chaos script: inject 30% packet loss on PG during checkout load test.
#
# Requires:
#   - toxiproxy running on localhost:8474
#   - Backend configured to connect to Postgres via toxiproxy
#     (e.g. DATABASE_URL=postgresql://...@localhost:5433/myntra_clone
#      where toxiproxy upstream is localhost:5432)
#   - k6 installed
#
# Usage:
#   1. Start toxiproxy proxy first:
#      toxiproxy-cli create -l 0.0.0.0:5433 -u localhost:5432 pg_proxy
#
#   2. Run this script:
#      bash test/load/chaos-pg-kill.sh
#
#   3. After completion, connect to Postgres and verify:
#      SELECT v.id, v."reservedStock", SUM(wi."reserved") AS wi_reserved
#      FROM "Variant" v
#      LEFT JOIN "WarehouseInventory" wi ON wi."variantId" = v.id
#      GROUP BY v.id
#      HAVING v."reservedStock" <> COALESCE(SUM(wi."reserved"), 0)::int;
#      → Must return 0 rows (I-1/I-2 intact despite chaos)
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

TOXI_API="http://localhost:8474"
PROXY_NAME="pg_proxy"
BASE_URL="${BASE_URL:-http://localhost:3000}"
VARIANT_ID="${VARIANT_ID:-1}"

echo "=== Chaos: PG packet loss during checkout ==="

# Verify toxiproxy is reachable
if ! curl -sf "${TOXI_API}/proxies" > /dev/null 2>&1; then
  echo "ERROR: toxiproxy not reachable at ${TOXI_API}. Start it first."
  echo "  docker run -d -p 8474:8474 -p 5433:5432 ghcr.io/shopify/toxiproxy"
  echo "  toxiproxy-cli create -l 0.0.0.0:5433 -u localhost:5432 pg_proxy"
  exit 1
fi

# Verify proxy exists
if ! curl -sf "${TOXI_API}/proxies/${PROXY_NAME}" > /dev/null 2>&1; then
  echo "Creating toxiproxy proxy: ${PROXY_NAME} (5433 → 5432)"
  curl -sf -X POST "${TOXI_API}/proxies" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"${PROXY_NAME}\",\"listen\":\"0.0.0.0:5433\",\"upstream\":\"localhost:5432\"}"
fi

echo "1/4 — Starting baseline k6 run (no chaos, 30s, 50 VU)..."
BASELINE_VARIANT_ID="${VARIANT_ID}" k6 run \
  --duration 30s --vus 50 \
  -e BASE_URL="${BASE_URL}" \
  -e VARIANT_ID="${VARIANT_ID}" \
  test/load/k6-checkout.js 2>&1 | tail -20
echo ""

echo "2/4 — Injecting 30% packet loss on ${PROXY_NAME}..."
curl -sf -X POST "${TOXI_API}/proxies/${PROXY_NAME}/toxics" \
  -H 'Content-Type: application/json' \
  -d '{"name":"packet_loss","type":"timeout","attributes":{"timeout":0},"toxicity":0.3}' > /dev/null

echo "3/4 — Running k6 checkout under chaos (2 min, 100 VU)..."
k6 run \
  --duration 2m --vus 100 \
  -e BASE_URL="${BASE_URL}" \
  -e VARIANT_ID="${VARIANT_ID}" \
  test/load/k6-checkout.js 2>&1 | tail -30
echo ""

echo "4/4 — Removing toxic..."
curl -sf -X DELETE "${TOXI_API}/proxies/${PROXY_NAME}/toxics/packet_loss" > /dev/null

echo ""
echo "=== Chaos run complete ==="
echo "Verify invariants by running:"
echo "  cd test && npx jest invariants.spec.ts --runInBand"
echo ""
echo "Or manually check I-1/I-2:"
echo "  psql -c \"SELECT v.id, v.\\\"reservedStock\\\", SUM(wi.\\\"reserved\\\") FROM \\\"Variant\\\" v LEFT JOIN \\\"WarehouseInventory\\\" wi ON wi.\\\"variantId\\\" = v.id GROUP BY v.id HAVING v.\\\"reservedStock\\\" <> COALESCE(SUM(wi.\\\"reserved\\\"), 0)::int;\""
