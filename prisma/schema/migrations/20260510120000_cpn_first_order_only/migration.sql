-- CPN-E09: firstOrderOnly coupon gate
-- Adds a boolean flag; default false is backwards-compatible.
ALTER TABLE "Coupon" ADD COLUMN IF NOT EXISTS "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false;
