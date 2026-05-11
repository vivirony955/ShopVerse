// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * QA Phase-5 — B-series edges & boundary conditions.
 *
 * Scope: deterministic boundary tests that exercise the exact numeric
 * thresholds in CartReservationService + refund accounting. All tests
 * use direct instantiation of CartReservationService (no DI graph) for
 * the same reasons as concurrency.spec.ts — non-flash path doesn't
 * touch Redis, and CronLock is only needed for the expiry cron (out of
 * scope here).
 *
 * Coverage:
 *
 *   QA-B-01 — Reservation TTL boundary. expiresAt == now() is still
 *             valid per validateForCheckout's `expiresAt <= new Date()`
 *             reject predicate — test both just-before and just-at.
 *             Confirms the `<=` vs `<` decision in
 *             cart-reservation.service.ts:214.
 *
 *   QA-B-02 — Last-unit purchase. stock=1, first reservation succeeds,
 *             next reservation on same SKU by a second user fails with
 *             "Insufficient stock" — no race needed, just the same
 *             conditional UPDATE WHERE (stock-reserved)>=qty serialising
 *             sequentially. This is the "happy path for exhaustion"
 *             that complements QA-D-01's concurrent version.
 *
 *   QA-B-06 — Price drift threshold. PRICE_DRIFT_TOLERANCE = 0.5%.
 *             Test both sides of the boundary:
 *               - 0.4% drift → validateForCheckout returns valid=true
 *               - 0.6% drift → validateForCheckout returns valid=false
 *                              with reason='Price drift' and changedItems populated
 *             Validates the `drift > PRICE_DRIFT_TOLERANCE` predicate
 *             (strict greater-than) at cart-reservation.service.ts:221.
 *
 *   QA-B-11 — Refund exactly == Order.total boundary for I-7.
 *             The validator checks `SUM(r.amount) > o.total + 0.01`, so
 *             a refund equal to the total is valid. A refund of total+0.02
 *             is a violation. Directly seeds RefundRequest rows and runs
 *             the invariant assertion.
 */
import { cleanDatabase, prisma } from './helpers/db';
import { cleanQATables, makeShopper, makeShoppersOnSameSKU } from './helpers/factories';
import { assertI7 } from './helpers/invariants';
import { CartReservationService } from '../backend/src/cart/cart-reservation.service';

// Raw I-7 query mirroring assertI7's HAVING clause, for tests that need to
// inspect the violation list rather than assert clean.
async function i7Violations(): Promise<{ orderId: number; total: number; refunded: number }[]> {
  return prisma.$queryRaw<{ orderId: number; total: number; refunded: number }[]>`
    SELECT o.id AS "orderId", o."total",
           COALESCE(SUM(r."amount"), 0) AS "refunded"
    FROM "Order" o
    LEFT JOIN "RefundRequest" r ON r."orderId" = o.id AND r."status" = 'COMPLETED'
    WHERE o."paymentStatus" IN ('REFUNDED', 'PARTIALLY_REFUNDED')
    GROUP BY o.id, o."total"
    HAVING COALESCE(SUM(r."amount"), 0) > o."total" + 0.01
  `;
}

describe('QA Phase-5: B-series edges', () => {
  let reservations: CartReservationService;

  beforeAll(async () => {
    const cronLockStub = {
      async runExclusive<T>(_n: string, _t: number, fn: () => Promise<T>): Promise<T | undefined> {
        return fn();
      },
    } as any;
    const redisStub = {
      async tryReserveGate() { return null; },
      async initReserveGate() { /* no-op */ },
      async releaseReserveGate() { /* no-op */ },
    } as any;
    reservations = new CartReservationService(prisma as any, cronLockStub, redisStub);
  });

  beforeEach(async () => {
    await cleanQATables();
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanQATables();
    await cleanDatabase();
  });

  // ─── QA-B-01: TTL boundary ───────────────────────────────────────────────

  it('QA-B-01: validateForCheckout rejects at expiresAt==now (boundary = reject)', async () => {
    const s = await makeShopper({ stock: 5 });
    const created = await reservations.createReservation(s.user.id);

    // Backdate expiresAt to exactly "now" — predicate is `expiresAt <= new Date()`
    // which MUST trigger, even at equality.
    const now = new Date();
    await prisma.cartReservation.update({
      where: { id: created.reservationId },
      data: { expiresAt: now },
    });

    const result = await reservations.validateForCheckout(created.reservationId, s.user.id);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Reservation expired');
  });

  it('QA-B-01: validateForCheckout accepts with generous future expiresAt', async () => {
    const s = await makeShopper({ stock: 5 });
    const created = await reservations.createReservation(s.user.id);

    // Push expiresAt 10 minutes into the future.
    await prisma.cartReservation.update({
      where: { id: created.reservationId },
      data: { expiresAt: new Date(Date.now() + 10 * 60_000) },
    });

    const result = await reservations.validateForCheckout(created.reservationId, s.user.id);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  // ─── QA-B-02: last-unit sequential exhaustion ────────────────────────────

  it('QA-B-02: stock=1, first reservation wins, second fails with Insufficient stock', async () => {
    const fx = await makeShoppersOnSameSKU(2, { stock: 1, cartQty: 1 });

    const first = await reservations.createReservation(fx.shoppers[0].userId);
    expect(first.items).toHaveLength(1);
    expect(first.items[0].quantity).toBe(1);

    await expect(
      reservations.createReservation(fx.shoppers[1].userId),
    ).rejects.toThrow(/Insufficient stock/i);

    // I-1: WI.reserved == 1, Variant.reservedStock == 1, stock unchanged.
    const v = await prisma.variant.findUnique({ where: { id: fx.variantId } });
    expect(v?.stock).toBe(1);
    expect(v?.reservedStock).toBe(1);
    const wi = await prisma.warehouseInventory.findFirst({
      where: { variantId: fx.variantId },
    });
    expect(wi?.stock).toBe(1);
    expect(wi?.reserved).toBe(1);
  });

  // ─── QA-B-06: price drift tolerance boundary ─────────────────────────────

  it('QA-B-06: 0.4% price drift (under 0.5% tolerance) → validateForCheckout valid', async () => {
    // basePrice=1000, discountPct=0 → lockedPrice = 1000
    const s = await makeShopper({ stock: 5, basePrice: 1000, discountPct: 0 });
    const created = await reservations.createReservation(s.user.id);

    // Bump product basePrice by 0.4% → currentPrice=1004, drift=0.004 < 0.005.
    await prisma.product.update({
      where: { id: s.product.id },
      data: { basePrice: 1004 },
    });

    const result = await reservations.validateForCheckout(created.reservationId, s.user.id);
    expect(result.valid).toBe(true);
  });

  it('QA-B-06: 0.6% price drift (over 0.5% tolerance) → validateForCheckout rejects with changedItems', async () => {
    const s = await makeShopper({ stock: 5, basePrice: 1000, discountPct: 0 });
    const created = await reservations.createReservation(s.user.id);

    // 0.6% → currentPrice=1006, drift=0.006 > 0.005 → rejects.
    await prisma.product.update({
      where: { id: s.product.id },
      data: { basePrice: 1006 },
    });

    const result = await reservations.validateForCheckout(created.reservationId, s.user.id);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Price drift');
    expect(result.changedItems).toBeDefined();
    expect(result.changedItems!.length).toBe(1);
    expect(result.changedItems![0].variantId).toBe(s.variant.id);
    expect(result.changedItems![0].lockedPrice).toBeCloseTo(1000, 2);
    expect(result.changedItems![0].currentPrice).toBeCloseTo(1006, 2);
  });

  // ─── QA-B-11: refund exactly == order.total boundary (I-7) ───────────────

  it('QA-B-11: refund exactly == Order.total → I-7 holds (boundary is inclusive)', async () => {
    const s = await makeShopper({ stock: 1 });
    const order = await prisma.order.create({
      data: {
        userId: s.user.id,
        addressSnapshot: { line1: 'test' } as any,
        subtotal: 500,
        total: 500,
        status: 'REFUNDED',
        paymentStatus: 'REFUNDED',
      },
    });

    // Full refund — exactly one row, amount == total.
    await prisma.refundRequest.create({
      data: {
        orderId: order.id,
        amount: 500,
        reason: 'customer_request',
        status: 'COMPLETED',
        destination: 'ORIGINAL_PAYMENT',
        reference: `refund:order:${order.id}:full`,
        processedAt: new Date(),
      },
    });

    // assertI7 throws on violation — passing = boundary is safe at equality.
    await assertI7();
    const v = await i7Violations();
    expect(v).toHaveLength(0);
  });

  it('QA-B-11: refund > Order.total (+0.02) → I-7 violation surfaces', async () => {
    const s = await makeShopper({ stock: 1 });
    const order = await prisma.order.create({
      data: {
        userId: s.user.id,
        addressSnapshot: { line1: 'test' } as any,
        subtotal: 500,
        total: 500,
        status: 'REFUNDED',
        paymentStatus: 'REFUNDED',
      },
    });

    // Two partial refunds summing to 500.02 — 0.02 over the tolerance (0.01).
    await prisma.refundRequest.createMany({
      data: [
        {
          orderId: order.id,
          amount: 300,
          reason: 'partial',
          status: 'COMPLETED',
          destination: 'ORIGINAL_PAYMENT',
          reference: `refund:order:${order.id}:a`,
          processedAt: new Date(),
        },
        {
          orderId: order.id,
          amount: 200.02,
          reason: 'partial',
          status: 'COMPLETED',
          destination: 'ORIGINAL_PAYMENT',
          reference: `refund:order:${order.id}:b`,
          processedAt: new Date(),
        },
      ],
    });

    const violations = await i7Violations();
    expect(violations.length).toBeGreaterThanOrEqual(1);
    const v = violations.find((x) => x.orderId === order.id);
    expect(v).toBeDefined();
    expect(Number(v!.refunded)).toBeCloseTo(500.02, 2);

    // Cleanup: remove the over-refund so afterAll cleanDatabase doesn't cascade-choke.
    // (FK from RefundRequest.orderId won't let the order delete otherwise.)
    await prisma.refundRequest.deleteMany({ where: { orderId: order.id } });
  });
});
