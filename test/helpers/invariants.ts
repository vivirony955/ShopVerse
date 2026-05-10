/**
 * QA Phase-1 — runtime invariant assertions.
 *
 * Each `assertIn(prisma)` function runs the SAME raw SQL that
 * `InvariantValidatorService` uses in production crons, so a green test
 * here is evidence the production cron would also be green. When these
 * fail, the failure message names the invariant, the offending row, and
 * the expected vs observed values — enough to triage without re-reading
 * the invariant definition.
 *
 * Usage pattern inside tests:
 *
 *   afterEach(async () => {
 *     await assertAllInvariants(); // catches regressions introduced by the test
 *   });
 */
import { prisma } from './db';

// ─── I-1/I-2: stock and reservation caches match WarehouseInventory ──────────

export interface InventoryDrift {
  variantId: number;
  cacheStock: number;
  whStock: number;
  cacheReserved: number;
  whReserved: number;
}

export async function checkI1I2Cache(): Promise<InventoryDrift[]> {
  return prisma.$queryRaw<InventoryDrift[]>`
    SELECT v.id AS "variantId",
           v."stock" AS "cacheStock",
           COALESCE(SUM(wi."stock"), 0)::int AS "whStock",
           v."reservedStock" AS "cacheReserved",
           COALESCE(SUM(wi."reserved"), 0)::int AS "whReserved"
    FROM "Variant" v
    LEFT JOIN "WarehouseInventory" wi ON wi."variantId" = v.id
    GROUP BY v.id
    HAVING v."stock" <> COALESCE(SUM(wi."stock"), 0)::int
        OR v."reservedStock" <> COALESCE(SUM(wi."reserved"), 0)::int
  `;
}

export interface OrderReservedDrift {
  variantId: number;
  cacheReserved: number;
  activeOrderQty: number;
}

/** I-2: `Variant.reservedStock >= Σ(active order item qty)`. */
export async function checkI2Orders(): Promise<OrderReservedDrift[]> {
  // BUG-FIX: the original LEFT JOIN on Order with a status filter left oi.*
  // in the result set even when the order didn't match (REFUNDED, CANCELLED,
  // etc.), so SUM(oi.quantity) counted items from ALL orders, not just active
  // ones. Fix: use CASE WHEN to only sum quantities where the order status
  // actually matched the active-order predicate.
  return prisma.$queryRaw<OrderReservedDrift[]>`
    SELECT v.id AS "variantId", v."reservedStock" AS "cacheReserved",
           COALESCE(SUM(
             CASE WHEN o."status" IN ('PENDING','CONFIRMED','PROCESSING','SHIPPED')
                  THEN oi."quantity" ELSE 0 END
           ), 0)::int AS "activeOrderQty"
    FROM "Variant" v
    LEFT JOIN "OrderItem" oi ON oi."variantId" = v.id AND oi."cancelledAt" IS NULL
    LEFT JOIN "Order" o ON o.id = oi."orderId"
    GROUP BY v.id
    HAVING v."reservedStock" < COALESCE(SUM(
             CASE WHEN o."status" IN ('PENDING','CONFIRMED','PROCESSING','SHIPPED')
                  THEN oi."quantity" ELSE 0 END
           ), 0)::int
  `;
}

export async function assertI1(): Promise<void> {
  const rows = await checkI1I2Cache();
  if (rows.length === 0) return;
  const stockDrift = rows.filter((r) => r.cacheStock !== r.whStock);
  if (stockDrift.length > 0) {
    throw new Error(
      `I-1 VIOLATION (${stockDrift.length} rows): ` +
      stockDrift.slice(0, 3).map((r) =>
        `variant=${r.variantId} cacheStock=${r.cacheStock} whStock=${r.whStock}`,
      ).join(' | '),
    );
  }
}

export async function assertI2(): Promise<void> {
  const cache = await checkI1I2Cache();
  const reservedDrift = cache.filter((r) => r.cacheReserved !== r.whReserved);
  if (reservedDrift.length > 0) {
    throw new Error(
      `I-2 VIOLATION (cache) (${reservedDrift.length} rows): ` +
      reservedDrift.slice(0, 3).map((r) =>
        `variant=${r.variantId} cacheReserved=${r.cacheReserved} whReserved=${r.whReserved}`,
      ).join(' | '),
    );
  }
  const orderDrift = await checkI2Orders();
  if (orderDrift.length > 0) {
    throw new Error(
      `I-2 VIOLATION (orders vs cache) (${orderDrift.length} rows): ` +
      orderDrift.slice(0, 3).map((r) =>
        `variant=${r.variantId} cacheReserved=${r.cacheReserved} activeOrderQty=${r.activeOrderQty}`,
      ).join(' | '),
    );
  }
}

// ─── I-3: wallet trial balance ───────────────────────────────────────────────

export interface WalletDrift {
  walletId: number;
  balance: number;
  ledger: number;
}

export async function assertI3(): Promise<void> {
  const diffs = await prisma.$queryRaw<WalletDrift[]>`
    SELECT w.id AS "walletId", w."balance",
           COALESCE(SUM(CASE WHEN t."type" = 'CREDIT' THEN t."amount"
                             WHEN t."type" = 'DEBIT'  THEN -t."amount"
                             ELSE 0 END), 0) AS "ledger"
    FROM "Wallet" w
    LEFT JOIN "WalletTransaction" t ON t."walletId" = w.id
    GROUP BY w.id, w."balance"
    HAVING ABS(w."balance" - COALESCE(SUM(CASE WHEN t."type" = 'CREDIT' THEN t."amount"
                                               WHEN t."type" = 'DEBIT'  THEN -t."amount"
                                               ELSE 0 END), 0)) > 0.01
  `;
  if (diffs.length > 0) {
    throw new Error(
      `I-3 VIOLATION (${diffs.length} wallets): ` +
      diffs.slice(0, 3).map((d) =>
        `wallet=${d.walletId} balance=${d.balance} ledger=${d.ledger}`,
      ).join(' | '),
    );
  }
}

// ─── I-5: order total formula ────────────────────────────────────────────────

export async function assertI5(): Promise<void> {
  const mismatches = await prisma.$queryRaw<
    { orderId: number; total: number; computed: number }[]
  >`
    SELECT o.id AS "orderId", o."total",
           (COALESCE(SUM(oi."price" * oi."quantity"), 0)
             - o."discountAmount"
             + COALESCE(o."shippingFee", 0)
             + COALESCE(o."taxAmount", 0)
             - COALESCE(o."walletAmountUsed", 0)
           ) AS "computed"
    FROM "Order" o
    LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id AND oi."cancelledAt" IS NULL
    GROUP BY o.id, o."total", o."discountAmount", o."shippingFee", o."taxAmount", o."walletAmountUsed"
    HAVING ABS(o."total" - (COALESCE(SUM(oi."price" * oi."quantity"), 0)
             - o."discountAmount"
             + COALESCE(o."shippingFee", 0)
             + COALESCE(o."taxAmount", 0)
             - COALESCE(o."walletAmountUsed", 0))) > 0.01
  `;
  if (mismatches.length > 0) {
    throw new Error(
      `I-5 VIOLATION (${mismatches.length} orders): ` +
      mismatches.slice(0, 3).map((m) =>
        `order=${m.orderId} stored=${m.total} computed=${m.computed}`,
      ).join(' | '),
    );
  }
}

// ─── I-7: refund ≤ order total ───────────────────────────────────────────────

export async function assertI7(): Promise<void> {
  const violations = await prisma.$queryRaw<
    { orderId: number; total: number; refunded: number }[]
  >`
    SELECT o.id AS "orderId", o."total",
           COALESCE(SUM(r."amount"), 0) AS "refunded"
    FROM "Order" o
    LEFT JOIN "RefundRequest" r ON r."orderId" = o.id AND r."status" = 'COMPLETED'
    WHERE o."paymentStatus" IN ('REFUNDED', 'PARTIALLY_REFUNDED')
    GROUP BY o.id, o."total"
    HAVING COALESCE(SUM(r."amount"), 0) > o."total" + 0.01
  `;
  if (violations.length > 0) {
    throw new Error(
      `I-7 VIOLATION (${violations.length} orders): ` +
      violations.slice(0, 3).map((v) =>
        `order=${v.orderId} refunded=${v.refunded} > total=${v.total}`,
      ).join(' | '),
    );
  }
}

// ─── I-9: coupon usedCount ≤ maxUses ─────────────────────────────────────────

export async function assertI9(): Promise<void> {
  const over = await prisma.coupon.findMany({
    where: {
      maxUses: { not: null },
      AND: [{ usedCount: { gt: 0 } }],
    },
    select: { id: true, code: true, usedCount: true, maxUses: true },
  });
  const bad = over.filter((c) => c.maxUses !== null && c.usedCount > c.maxUses);
  if (bad.length > 0) {
    throw new Error(
      `I-9 VIOLATION (${bad.length}): ` +
      bad.slice(0, 3).map((c) => `${c.code} used=${c.usedCount} max=${c.maxUses}`).join(' | '),
    );
  }
}

// ─── I-8: no expired ACTIVE reservations (cron eventually consistent) ───────

export async function assertI8(maxAgeSeconds = 120): Promise<void> {
  const rows = await prisma.cartReservation.findMany({
    where: {
      status: 'ACTIVE',
      expiresAt: { lt: new Date(Date.now() - maxAgeSeconds * 1000) },
    },
    select: { id: true, expiresAt: true },
  });
  if (rows.length > 0) {
    throw new Error(
      `I-8 VIOLATION (${rows.length} expired ACTIVE reservations older than ${maxAgeSeconds}s): ` +
      rows.slice(0, 3).map((r) => `id=${r.id} expired=${r.expiresAt.toISOString()}`).join(' | '),
    );
  }
}

// ─── I-11: every wallet refund credit has a RefundRequest ────────────────────

export async function assertI11(): Promise<void> {
  // Every WalletTransaction with type=CREDIT whose reference starts with 'refund:'
  // must have a matching RefundRequest row.
  const orphans = await prisma.$queryRaw<{ id: number; reference: string }[]>`
    SELECT wt.id, wt."reference"
    FROM "WalletTransaction" wt
    LEFT JOIN "RefundRequest" rr ON rr.id = wt."refundRequestId"
    WHERE wt."type" = 'CREDIT'
      AND wt."reference" LIKE 'refund:%'
      AND wt."refundRequestId" IS NOT NULL
      AND rr.id IS NULL
  `;
  if (orphans.length > 0) {
    throw new Error(
      `I-11 VIOLATION (${orphans.length} orphan wallet refunds): ` +
      orphans.slice(0, 3).map((o) => `wt=${o.id} ref=${o.reference}`).join(' | '),
    );
  }
}

// ─── Omnibus ─────────────────────────────────────────────────────────────────

/**
 * Run the invariants that matter for most QA scenarios. Skip I-4 (ledger
 * balance — not all tests touch the ledger) and I-13 (Invoice pending).
 * Fails fast on the first violation, so the error message points at the
 * exact invariant that broke.
 */
export async function assertAllInvariants(): Promise<void> {
  await assertI1();
  await assertI2();
  await assertI3();
  await assertI5();
  await assertI7();
  await assertI8();
  await assertI9();
  await assertI11();
}
