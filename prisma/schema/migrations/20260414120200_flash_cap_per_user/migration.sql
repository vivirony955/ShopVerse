-- FLASH-CAP: Add perUserMaxQty to FlashSaleProduct
-- 0 = unlimited; >0 enforced per user per flash sale in cart-reservation service

ALTER TABLE "FlashSaleProduct"
  ADD COLUMN IF NOT EXISTS "perUserMaxQty" INTEGER NOT NULL DEFAULT 0;
