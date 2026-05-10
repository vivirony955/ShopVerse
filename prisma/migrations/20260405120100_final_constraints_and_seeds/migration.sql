-- FINAL §2 invariants as DB-enforced CHECK constraints + DEFAULT warehouse seed.
-- This consolidates all the constraints/seeds that previously lived across
-- 20260404000000..20260405000300 into one migration that follows the clean
-- baseline. Keep this file alphabetically last after baseline.

-- ─── I-1 / R-001 inventory invariants ────────────────────────────────────────
ALTER TABLE "Variant"
  ADD CONSTRAINT "variant_stock_nonneg_chk" CHECK ("stock" >= 0),
  ADD CONSTRAINT "variant_reserved_nonneg_chk" CHECK ("reservedStock" >= 0),
  ADD CONSTRAINT "variant_reserved_le_stock_chk" CHECK ("reservedStock" <= "stock"),
  ADD CONSTRAINT "variant_minorder_pos_chk" CHECK ("minOrderQty" >= 1),
  ADD CONSTRAINT "variant_maxorder_ge_min_chk" CHECK ("maxOrderQty" >= "minOrderQty");

ALTER TABLE "WarehouseInventory"
  ADD CONSTRAINT "wi_stock_nonneg_chk" CHECK ("stock" >= 0),
  ADD CONSTRAINT "wi_reserved_nonneg_chk" CHECK ("reserved" >= 0),
  ADD CONSTRAINT "wi_reserved_le_stock_chk" CHECK ("reserved" <= "stock");

-- ─── I-2 / I-10 wallet + loyalty non-negative balances ───────────────────────
ALTER TABLE "Wallet"
  ADD CONSTRAINT "wallet_balance_nonneg_chk" CHECK ("balance" >= 0);

ALTER TABLE "User"
  ADD CONSTRAINT "user_loyaltypoints_nonneg_chk" CHECK ("loyaltyPoints" >= 0);

-- ─── I-5 Order.total bounds ──────────────────────────────────────────────────
ALTER TABLE "Order"
  ADD CONSTRAINT "order_total_nonneg_chk" CHECK ("total" >= 0),
  ADD CONSTRAINT "order_subtotal_nonneg_chk" CHECK ("subtotal" >= 0),
  ADD CONSTRAINT "order_discount_nonneg_chk" CHECK ("discountAmount" >= 0),
  ADD CONSTRAINT "order_total_le_subtotal_chk" CHECK ("total" <= "subtotal" + 1);

-- ─── RefundRequest amount positive ───────────────────────────────────────────
ALTER TABLE "RefundRequest"
  ADD CONSTRAINT "refundrequest_amount_pos_chk" CHECK ("amount" > 0);

-- ─── StockNotification partial unique + email format ─────────────────────────
CREATE UNIQUE INDEX "StockNotification_variantId_email_active_key"
  ON "StockNotification"("variantId", "email") WHERE "notifiedAt" IS NULL;
ALTER TABLE "StockNotification"
  ADD CONSTRAINT "stocknotification_email_fmt_chk" CHECK (position('@' IN "email") > 1);

-- ─── Phase 1: seed DEFAULT warehouse (FINAL §7.1 single-WH) ─────────────────
INSERT INTO "Warehouse" ("name", "code", "city", "state", "pincode", "isActive", "createdAt")
VALUES ('Default Warehouse', 'DEFAULT', 'HQ', 'HQ', '000000', true, NOW())
ON CONFLICT ("code") DO NOTHING;
