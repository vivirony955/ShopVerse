-- Fix order_total_le_subtotal_chk: the original constraint (total <= subtotal + 1)
-- did not account for shippingFee and taxAmount being added to total.
-- Correct invariant (I-5): total = subtotal - discount + shipping + tax - wallet - loyalty
-- Drop the incorrect constraint; I-5 is enforced at the service layer.
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "order_total_le_subtotal_chk";
