-- ADM-RBAC: Expand Role enum + RefundApproval maker-checker table

-- Add new Role enum values (Postgres requires CREATE TYPE IF NOT EXISTS workaround)
DO $$ BEGIN
  ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CS_AGENT';
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'OPS';
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'FINANCE';
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MERCH';
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- RefundApprovalStatus enum
DO $$ BEGIN
  CREATE TYPE "RefundApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- RefundApproval table for maker-checker on refunds > ₹5000
CREATE TABLE IF NOT EXISTS "RefundApproval" (
  "id"              SERIAL PRIMARY KEY,
  "orderId"         INTEGER NOT NULL,
  "amount"          DOUBLE PRECISION NOT NULL,
  "reason"          TEXT NOT NULL,
  "requestedBy"     INTEGER NOT NULL,
  "requestedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedBy"      INTEGER,
  "approvedAt"      TIMESTAMP(3),
  "rejectedBy"      INTEGER,
  "rejectedAt"      TIMESTAMP(3),
  "rejectedReason"  TEXT,
  "status"          "RefundApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "refundRequestId" INTEGER UNIQUE,
  CONSTRAINT "RefundApproval_orderId_fkey"         FOREIGN KEY ("orderId")         REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RefundApproval_refundRequestId_fkey" FOREIGN KEY ("refundRequestId") REFERENCES "RefundRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "RefundApproval_orderId_idx" ON "RefundApproval" ("orderId");
CREATE INDEX IF NOT EXISTS "RefundApproval_status_idx"  ON "RefundApproval" ("status");
