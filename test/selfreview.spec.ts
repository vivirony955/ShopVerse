// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * QA Phase-6 — F-series self-review additions.
 *
 * Scope: the deterministic F-scenarios that fit the current service
 * surface. Scenarios requiring multi-pod simulation (F-02 clock skew),
 * chargeback webhook wiring (F-08 — no clawback path exists today),
 * connection-pool exhaustion probes (F-14), or in-process bulk-import
 * hooks (F-12 — already covered by QA-E-14 drift recovery) are
 * intentionally out of scope for this phase.
 *
 * Coverage:
 *
 *   QA-F-10 — Promo stacking overflow.
 *             CouponsService.calcDiscount clamps discount to
 *             `Math.min(computed, amount)` for both PERCENTAGE and FIXED
 *             types. The resulting Order.total floors at 0 — never
 *             negative. Validates both branches:
 *               (a) FIXED overflow: discountValue=10000 on subtotal=500
 *                   → discount=500, total=0.
 *               (b) PERCENTAGE=100: discountValue=100 on subtotal=500
 *                   → discount=500, total=0.
 *             Guards the `Math.min` clamp at coupons.service.ts:29,31.
 *             If a future refactor removes the clamp (e.g. splits it
 *             across layers), Order.total would go negative and this
 *             test would fail before I-5 cron detection.
 *
 *   QA-F-10b — Price precision edge: coupon rounding should never
 *             produce a negative float via cumulative FP error. Tests
 *             a 99.99% discount on a small subtotal — result must
 *             still be ≥ 0 and within 1¢ of the expected value.
 */
import { cleanDatabase, prisma } from './helpers/db';
import { cleanQATables } from './helpers/factories';
import { CouponsService } from '../backend/src/coupons/coupons.service';

describe('QA Phase-6: F-series self-review', () => {
  let coupons: CouponsService;

  beforeAll(() => {
    // Direct instantiation — CouponsService only depends on PrismaService,
    // no cron/schedule/DI complexity. Matches the harness-free pattern
    // from concurrency.spec.ts + edges.spec.ts.
    coupons = new CouponsService(prisma as any);
  });

  beforeEach(async () => {
    await cleanQATables();
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanQATables();
    await cleanDatabase();
    await prisma.$disconnect();
  });

  // ─── QA-F-10: stacking overflow clamp ────────────────────────────────────

  it('QA-F-10a: FIXED discount > subtotal → clamped to subtotal (Order.total floors at 0)', async () => {
    const code = `OVERFLOW_FIX_${Date.now()}`;
    await prisma.coupon.create({
      data: {
        code,
        discountType: 'FIXED',
        discountValue: 10000, // 20x the subtotal
        minOrderAmount: 0,
        isActive: true,
      },
    });

    const subtotal = 500;
    const discount = await coupons.applyDiscount(code, subtotal);
    expect(discount).toBe(500);

    // Downstream: total = subtotal - discount = 0. Never negative.
    const total = subtotal - discount;
    expect(total).toBe(0);
    expect(total).toBeGreaterThanOrEqual(0);
  });

  it('QA-F-10b: PERCENTAGE 100 → discount == subtotal (total floors at 0)', async () => {
    const code = `OVERFLOW_PCT_${Date.now()}`;
    await prisma.coupon.create({
      data: {
        code,
        discountType: 'PERCENTAGE',
        discountValue: 100,
        minOrderAmount: 0,
        isActive: true,
      },
    });

    const subtotal = 500;
    const discount = await coupons.applyDiscount(code, subtotal);
    expect(discount).toBe(500);
    expect(subtotal - discount).toBe(0);
  });

  it('QA-F-10c: PERCENTAGE 99.99 on small subtotal → total ≥ 0 (FP precision guard)', async () => {
    const code = `PRECISION_${Date.now()}`;
    await prisma.coupon.create({
      data: {
        code,
        discountType: 'PERCENTAGE',
        discountValue: 99.99,
        minOrderAmount: 0,
        isActive: true,
      },
    });

    const subtotal = 100;
    const discount = await coupons.applyDiscount(code, subtotal);
    // Expected: 99.99. Must be ≤ subtotal (no FP overshoot past 100).
    expect(discount).toBeLessThanOrEqual(subtotal);
    expect(discount).toBeCloseTo(99.99, 2);
    const total = subtotal - discount;
    expect(total).toBeGreaterThanOrEqual(0);
    expect(total).toBeCloseTo(0.01, 2);
  });
});
