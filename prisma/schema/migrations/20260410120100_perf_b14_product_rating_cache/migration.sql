-- B-14 PERF: pre-computed rating cache on Product to eliminate N+1 review
-- aggregation on PLP/PDP. Maintained as write-through by reviews.service.ts.

-- AlterTable: add cache columns with safe defaults (no backfill lock on insert)
ALTER TABLE "Product"
  ADD COLUMN "avgRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "reviewCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill from existing reviews. Products with zero reviews keep DEFAULT 0.
UPDATE "Product" p
SET
  "avgRating"   = COALESCE(agg.avg_rating, 0),
  "reviewCount" = COALESCE(agg.cnt, 0)
FROM (
  SELECT "productId", AVG("rating")::double precision AS avg_rating, COUNT(*)::int AS cnt
  FROM "Review"
  GROUP BY "productId"
) AS agg
WHERE p.id = agg."productId";
