# Flash Sale Preparation Runbook

**Owner**: OPS  
**Related Design**: SYSTEM_DESIGN_FINAL.md §10 (S-10 Flash Sales)  
**SLA**: All T-* steps must complete before sale open. No step is optional.

---

## T-24h: Product + Sale Setup

- [ ] Create `FlashSale` record with correct `startsAt`, `endsAt`, `discountPct`
- [ ] Set `slug` to a unique, URL-safe value (used in share links)
- [ ] Add products via `POST /flash-sales/:id/products` with `perUserMaxQty` set (recommended: 2–5)
- [ ] Verify `discountPct` is correct — double-check: `discountPct = 40` means 40% OFF, not 40% of price
- [ ] Confirm stock levels in `WarehouseInventory` — if less than expected demand, adjust or cap `perUserMaxQty`
- [ ] Test the flash sale URL on staging: `GET /flash-sales/:slug`

---

## T-1h: Cache Pre-warm

- [ ] Pre-warm product cache: `GET /products?flashSaleId=<id>` to populate Redis PLP cache
- [ ] Verify Redis is healthy: `redis-cli PING` → PONG
- [ ] Check Redis memory: `redis-cli INFO memory | grep used_memory_human`
  - Warn if > 80% of maxmemory; evict stale PLP cache entries if needed
- [ ] Confirm RESERVE_GATE_TTL is long enough to span the sale window (default 1h)
- [ ] Verify `InvoiceSequence` row exists for current financial year:
  ```sql
  SELECT * FROM "InvoiceSequence" WHERE "financialYear" = '2026-27';
  ```

---

## T-15m: System Health Check

- [ ] DB connections: `SELECT count(*) FROM pg_stat_activity WHERE state = 'active'`
  - Alert if > 80% of `connection_limit` in DATABASE_URL
- [ ] CronLock: verify no stale locks from previous run:
  ```sql
  SELECT * FROM "CronLock" WHERE "expiresAt" < NOW();
  ```
  Delete stale rows if found.
- [ ] Check invariant validator heartbeat via `GET /admin/live-metrics` — no VIOLATIONS in last run
- [ ] Scale pods: minimum 2 backend instances for flash sale traffic (3+ for >10K expected users)

---

## T-0: Go-Live

- [ ] Verify `FlashSale.status` is `SCHEDULED` (sync cron will flip it to ACTIVE)
- [ ] Or manually trigger: `PATCH /flash-sales/:id/sync` if cron hasn't fired yet
- [ ] Monitor real-time: `GET /admin/live-metrics` every 30s during first 5 minutes
- [ ] Watch for: `ordersLastHour` spike, `revenueLastHour` growth, no error spikes in logs

---

## During Sale: Live Monitoring

| Signal | Threshold | Action |
|---|---|---|
| WI.reserved drift (I-2 alert) | Any violation | Check invariant-validator logs immediately; pause sale if drift > 5% |
| Fraud score spikes (high `preOrderFraudCheck` blocks) | > 10% of requests | Review fraud.service logs; possibly lower threshold temporarily |
| Cart reservation failures (BadRequest: "Insufficient stock") | Expected if sold out | Normal — verify WI.stock is 0, not a bug |
| Redis OOM errors | Any | Flush flash gate keys: `redis-cli KEYS "reserve:gate:*" | xargs redis-cli DEL` |
| Response p95 > 2s | Sustained > 2 min | Scale pods; check PgBouncer pool saturation |

---

## Post-Sale: Cleanup

- [ ] Sale ends → cron sets `FlashSale.status = ENDED` (verify within 5 min of `endsAt`)
- [ ] Release any expired reservations: `POST /cart/reservation/expire-old` (or wait for expiry cron)
- [ ] Check unsold flash reservations are expired: no ACTIVE `CartReservation.isFlash=true` with `expiresAt < now()`
- [ ] Review I-2 invariant: `WarehouseInventory.reserved` should return to pre-sale baseline for unsold stock
- [ ] Export GMV report: `GET /admin/revenue-report?days=1`
- [ ] Update fraud model if unusual patterns detected (high return rate from flash buyers)

---

## Rollback: Cancel Sale Mid-Run

If a critical bug is found during sale:

1. Set `FlashSale.status = ENDED` directly:
   ```sql
   UPDATE "FlashSale" SET "status" = 'ENDED', "endsAt" = NOW() WHERE "id" = <id>;
   ```
2. New reservations will fail (flash gate rejects ENDED sale items)
3. In-flight checkouts with valid (not-yet-expired) reservations will still complete — this is correct
4. Existing ACTIVE reservations expire naturally (5-min TTL)
5. Do NOT delete flash sale products while reservations are ACTIVE — FK constraints will block it anyway

---

## Common Issues

| Issue | Cause | Fix |
|---|---|---|
| `perUserMaxQty` not enforced | cart-reservation service wasn't queried with flash sale item | Verify `FlashSaleProduct.perUserMaxQty > 0` in DB |
| Double-booking on sold-out SKU | Redis gate cache stale | Clear gate keys and let Postgres be authoritative |
| Stuck CANCELLING orders | Stripe refund timeout during surge | refund-retry cron picks up within 1h; check `RefundRequest.retryCount` |
| I-2 violation post-sale | Race between consume + expiry | Run `docs/runbooks/wi-drift.md` recovery SQL |
