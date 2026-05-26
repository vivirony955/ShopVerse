-- D-09: Add shippingFee and taxAmount to Order
-- Required for: I-5 formula correctness + India GST invoice compliance
-- Both default 0 so existing rows are valid immediately.

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "shippingFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "taxAmount"   DOUBLE PRECISION NOT NULL DEFAULT 0;
