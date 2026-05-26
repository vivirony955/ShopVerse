# Runbook: WarehouseInventory / Variant Cache Drift (O-05)

**Invariant**: I-1 (`∑(WarehouseInventory.stock) == Variant.stock`) and I-2 (`∑(WarehouseInventory.reserved) == Variant.reservedStock == ∑(active OrderItem.qty)`).

**Authoritative source**: `WarehouseInventory`. `Variant.stock` and `Variant.reservedStock` are write-through caches.

## 1. Detection

Drift is surfaced by `InvariantValidatorService.validateInventoryInvariants` (cron `EVERY_HOUR`). Signals:

| Signal | Source | Action |
|---|---|---|
| `[INVARIANT_ALERT] validator=inventory violations=N` | Log aggregator (Sentry / Loki) | Page on-call — open this runbook |
| `[INVARIANT_ALERT] validator=inventory status=ERROR` | Log aggregator | Cron itself failed — check DB connectivity first |
| `I-1/I-2 drift variantId=... cacheStock=X vs whStock=Y` | Per-row WARN | Individual drifting variants |
| `I-2 violation variantId=...: reservedStock=X < activeOrderQty=Y` | Per-row WARN | Reserved tally under-counts live orders (more severe) |
| Heartbeat stale (`getHeartbeats()` lastRunAt > 2h old) | Admin endpoint poll | Cron stopped running — restart scheduler pod |

## 2. Triage (< 5 min)

1. **Scope** — how many variants? Single variant = isolated bug. >100 variants = systemic (recent deploy / migration / cron outage). Check `violations=N` in the alert line.
2. **Severity** — I-2 violation (`reservedStock < activeOrderQty`) is **P0** — we may oversell. I-1 cache drift alone is **P1** — UI shows wrong stock but cannot oversell because WI is authoritative at reserve time.
3. **Recent changes** — `git log --since="6 hours ago" -- backend/src/inventory backend/src/warehouse backend/src/cart backend/src/orders prisma/schema/` — any inventory-path change is the prime suspect.
4. **Cron health** — confirm `invariant-inventory`, `reservation-expiry`, and `cart-reservation-cleanup` all ran in the last hour. A silent cron outage masquerades as "drift".

## 3. Containment (P0 only)

If I-2 violation (oversell risk) is confirmed on flash-sale / hot SKUs:

```sql
-- OPTIONAL kill-switch: disable checkout for affected variants until recovery.
-- Requires FeatureFlag table or equivalent; otherwise skip to step 4.
UPDATE "Variant" SET "backorderAllowed" = false WHERE id IN (<ids>);
```

For I-1 only (cosmetic), skip containment — proceed to recovery.

## 4. Diagnosis — identify the write path that bypassed `syncVariantCache`

Every inventory-mutating transaction MUST call `warehouse.service.ts::syncVariantCache(tx, variantId)` (or equivalent raw UPDATE) in the same tx. Grep for WI writes that don't:

```bash
grep -rn "warehouseInventory" backend/src --include="*.ts" \
  | grep -E "update|upsert|create|delete|\\\$executeRaw"
```

For each hit, verify the surrounding transaction also touches `Variant.stock` / `Variant.reservedStock`. Known correct paths:

| Path | File | Sync call |
|---|---|---|
| Admin stock adjust | `warehouse.service.ts::updateInventory` | `syncVariantCache` inside tx ✅ |
| Shipment create (reserve) | `warehouse.service.ts::createShipment` | `syncVariantCache` inside tx ✅ |
| Shipment DELIVERED (commit) | `warehouse.service.ts::updateShipmentStatus` | `syncVariantCache` inside tx ✅ |
| Shipment RTO (restore) | `warehouse.service.ts::updateShipmentStatus` | `syncVariantCache` inside tx ✅ |
| Order split | `warehouse.service.ts::splitOrderByWarehouse` | `syncVariantCache` inside tx ✅ |
| Cart reservation expiry (CTE) | `cart-reservation.service.ts::cleanupExpired` | Inline CTE updates Variant ✅ |
| Cart reservation consume | `cart-reservation.service.ts::consume` | Inline tx updates Variant ✅ |

Any other site that touches `WarehouseInventory` without updating `Variant` is the bug. Fix the write path **before** recovery — otherwise drift will reappear within the hour.

## 5. Recovery — rebuild the cache from the authoritative table

Safe to run anytime (idempotent). Scoped to affected variants when possible:

```sql
-- Option A: targeted (use the variantIds from the alert log)
UPDATE "Variant" v SET
  "stock" = COALESCE((SELECT SUM(wi."stock")::int
                      FROM "WarehouseInventory" wi WHERE wi."variantId" = v.id), 0),
  "reservedStock" = COALESCE((SELECT SUM(wi."reserved")::int
                              FROM "WarehouseInventory" wi WHERE wi."variantId" = v.id), 0)
WHERE v.id IN (<variantIds>);

-- Option B: full rebuild (safe but slow; use when scope > ~1000 variants)
UPDATE "Variant" v SET
  "stock" = COALESCE(agg.stock, 0),
  "reservedStock" = COALESCE(agg.reserved, 0)
FROM (
  SELECT "variantId",
         SUM("stock")::int AS stock,
         SUM("reserved")::int AS reserved
  FROM "WarehouseInventory"
  GROUP BY "variantId"
) agg
WHERE v.id = agg."variantId";
```

Run inside a transaction. Verify row count matches expected scope before COMMIT.

**Special case — I-2 under-count** (`reservedStock < activeOrderQty`): the cache alone isn't wrong, `WarehouseInventory.reserved` is itself under-counted. Rebuild `WI.reserved` from active orders first:

```sql
-- DANGEROUS — only run after isolating the offending variants. Requires ops approval.
-- Sums active OrderItem quantities per (warehouseId, variantId) via the shipment that routed them.
WITH active_reserves AS (
  SELECT si."warehouseId", oi."variantId", SUM(oi."quantity")::int AS qty
  FROM "OrderItem" oi
  JOIN "Order" o ON o.id = oi."orderId"
  JOIN "ShipmentItem" si2 ON si2."variantId" = oi."variantId"
  JOIN "Shipment" si ON si.id = si2."shipmentId" AND si."orderId" = o.id
  WHERE o."status" IN ('PENDING','CONFIRMED','PROCESSING','PACKED','SHIPPED')
    AND oi."cancelledAt" IS NULL
    AND si."status" NOT IN ('DELIVERED','RTO','CANCELLED')
    AND oi."variantId" IN (<variantIds>)
  GROUP BY si."warehouseId", oi."variantId"
)
UPDATE "WarehouseInventory" wi
SET "reserved" = COALESCE(ar.qty, 0)
FROM active_reserves ar
WHERE wi."warehouseId" = ar."warehouseId"
  AND wi."variantId" = ar."variantId";
```

Then re-run Option A to resync `Variant` cache.

## 6. Verification

1. Manually invoke the cron: either wait for the top of the next hour, or call the validator directly from a REPL:
   ```
   await app.get(InvariantValidatorService).validateInventoryInvariants()
   ```
2. Expect: log `I-1/I-2 invariants OK`, heartbeat `lastStatus: 'OK'`, `violationCount: 0`.
3. Spot-check 3 affected variants against PLP / PDP — UI stock should match DB.
4. Confirm no new violations for 3 consecutive cron runs (3 hours).

## 7. Postmortem checklist

- [ ] Which write path bypassed `syncVariantCache`? File + line.
- [ ] Why did CI not catch it? Add a test.
- [ ] Was the drift caught by the cron or by a customer complaint? Target: always by cron.
- [ ] How long between drift introduction and detection? Target: < 1h (cron cadence).
- [ ] Update `SYSTEM_DESIGN_FINAL.md §32` if a new class of bug emerged.
- [ ] Add the bypass-path to `memory/known_pitfalls.md`.

## 8. Related runbooks / references

- `SYSTEM_DESIGN_FINAL.md §2` — full invariant list
- `SYSTEM_DESIGN_FINAL.md §7` — inventory model
- `backend/src/common/invariant-validator.service.ts` — detector source
- `backend/src/warehouse/warehouse.service.ts::syncVariantCache` — canonical recovery primitive
