-- W5 PERF: refund retry tracking for the refund-retry cron.
-- Adds retryCount + lastRetryAt to RefundRequest, plus a composite index
-- covering the hot cron scan (status='PROCESSING' AND updatedAt < now()-1h).

-- AlterTable
ALTER TABLE "RefundRequest"
  ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastRetryAt" TIMESTAMP(3);

-- CreateIndex: supports the cron scan predicate
CREATE INDEX "RefundRequest_status_updatedAt_idx" ON "RefundRequest"("status", "updatedAt");
