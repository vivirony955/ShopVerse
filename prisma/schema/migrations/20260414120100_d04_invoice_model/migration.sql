-- D-04: Invoice model + InvoiceSequence for I-13 sequential invoice numbers
-- India GST compliance: every confirmed order gets INV/YYYY-YY/NNNNNN

CREATE TABLE IF NOT EXISTS "Invoice" (
  "id"             SERIAL PRIMARY KEY,
  "orderId"        INTEGER NOT NULL UNIQUE,
  "invoiceNumber"  TEXT NOT NULL UNIQUE,
  "financialYear"  TEXT NOT NULL,
  "sequence"       INTEGER NOT NULL,
  "subtotal"       DOUBLE PRECISION NOT NULL,
  "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "shippingFee"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "taxAmount"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total"          DOUBLE PRECISION NOT NULL,
  "issuedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("financialYear", "sequence"),
  CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Invoice_financialYear_idx" ON "Invoice" ("financialYear");
CREATE INDEX IF NOT EXISTS "Invoice_issuedAt_idx"       ON "Invoice" ("issuedAt");

CREATE TABLE IF NOT EXISTS "InvoiceSequence" (
  "id"            SERIAL PRIMARY KEY,
  "financialYear" TEXT NOT NULL UNIQUE,
  "lastSequence"  INTEGER NOT NULL DEFAULT 0
);

-- Seed the current financial year so the first invoice doesn't need an extra round-trip
INSERT INTO "InvoiceSequence" ("financialYear", "lastSequence")
VALUES ('2026-27', 0)
ON CONFLICT ("financialYear") DO NOTHING;
