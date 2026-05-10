-- O-06: Aggressive autovacuum settings for high-churn tables.
-- Default autovacuum triggers at 20% table size. At production scale these
-- tables turn over much faster — bloat degrades index scan performance quickly.
-- Setting vacuum_scale_factor to 1% means autovacuum fires after ~1% of rows change.

-- CartReservation: high insert/update/delete rate (every checkout cycle)
ALTER TABLE "CartReservation"
  SET (autovacuum_vacuum_scale_factor = 0.01,
       autovacuum_analyze_scale_factor = 0.005,
       autovacuum_vacuum_cost_delay = 2);

-- WarehouseInventory: updated on every reserve/release/commit
ALTER TABLE "WarehouseInventory"
  SET (autovacuum_vacuum_scale_factor = 0.01,
       autovacuum_analyze_scale_factor = 0.005,
       autovacuum_vacuum_cost_delay = 2);

-- OrderItem: insert-heavy, also updated on cancel/refund
ALTER TABLE "OrderItem"
  SET (autovacuum_vacuum_scale_factor = 0.02,
       autovacuum_analyze_scale_factor = 0.01);

-- WalletTransaction: append-only ledger, grows continuously
ALTER TABLE "WalletTransaction"
  SET (autovacuum_vacuum_scale_factor = 0.02,
       autovacuum_analyze_scale_factor = 0.01);
