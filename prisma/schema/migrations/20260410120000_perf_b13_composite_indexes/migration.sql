-- B-13 PERF: composite indexes for hot query paths
-- Created via `prisma migrate diff --from-schema-datasource --to-schema-datamodel`
-- (shadow DB bypass on Windows — see known_pitfalls.md)

-- CreateIndex: covers partial-cancellation scans on OrderItem
CREATE INDEX "OrderItem_orderId_cancelledAt_idx" ON "OrderItem"("orderId", "cancelledAt");

-- CreateIndex: covers order-scoped refund status lookups
CREATE INDEX "RefundRequest_orderId_status_idx" ON "RefundRequest"("orderId", "status");
