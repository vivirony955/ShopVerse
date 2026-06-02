#!/usr/bin/env bash
# Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
# See LICENSE in the project root for license information.
#
# Runs every k6 scenario sequentially with a consolidated summary.
# Each script prints its own table; this wrapper just orchestrates +
# fails fast on any non-zero exit (caused by k6 threshold breaches).
#
# Usage:
#   ./run-all.sh                            # against http://localhost:4000
#   BASE_URL=https://staging.example k6 run # against staging

set -euo pipefail
cd "$(dirname "$0")"

: "${BASE_URL:=http://localhost:4000}"
export BASE_URL

scripts=(
  "01-products-list.js"
  "02-cart-add.js"
  "03-orders-place.js"
  "04-wallet-credit.js"
  "05-orders-detail.js"
)

echo "▶ Running ShopVerse bench suite against ${BASE_URL}"
echo

# Quick reachability check — fail fast if the target is down before burning
# 20 minutes of bench time.
if ! curl -sf "${BASE_URL}/api/health" >/dev/null; then
  echo "ERROR: ${BASE_URL}/api/health is not reachable. Start the backend first."
  exit 2
fi

for script in "${scripts[@]}"; do
  echo
  echo "═══════════════════════════════════════════════════════════════"
  echo "▶ ${script}"
  echo "═══════════════════════════════════════════════════════════════"
  k6 run "${script}"
done

echo
echo "✔ All scenarios complete."
