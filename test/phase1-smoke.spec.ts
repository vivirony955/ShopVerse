// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * QA Phase-1 smoke test.
 *
 * Validates that:
 *   1. factories.ts can build a clean shopper graph
 *   2. invariants.ts passes on a freshly seeded fixture
 *   3. concurrency.ts::parallel returns correct counts
 *   4. time.ts freezeDate/unfreezeDate round-trips
 *
 * This spec does NOT exercise the business logic under test — it only
 * verifies the Phase-1 helper layer is functional so Phase-2/3 specs can
 * depend on it. Runs against the real test database.
 */
import { cleanDatabase, prisma } from './helpers/db';
import {
  cleanQATables,
  ensureDefaultWarehouse,
  makeShopper,
  makeShoppersOnSameSKU,
} from './helpers/factories';
import { assertAllInvariants, assertI1, assertI2 } from './helpers/invariants';
import { parallel, barrier, isRaceResult } from './helpers/concurrency';
import { freezeDate, advanceDate, unfreezeDate } from './helpers/time';

describe('Phase-1 helper smoke test', () => {
  beforeEach(async () => {
    await cleanQATables();
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanQATables();
    await cleanDatabase();
    await prisma.$disconnect();
  });

  it('factories: makeShopper builds a clean graph with invariants holding', async () => {
    const s = await makeShopper({ stock: 25, cartQty: 2 });
    expect(s.user.id).toBeGreaterThan(0);
    expect(s.variant.id).toBeGreaterThan(0);
    expect(s.warehouseId).toBeGreaterThan(0);

    // I-1 holds: Variant.stock == WI.stock == 25
    const v = await prisma.variant.findUnique({ where: { id: s.variant.id } });
    const wi = await prisma.warehouseInventory.findUnique({
      where: { warehouseId_variantId: { warehouseId: s.warehouseId, variantId: s.variant.id } },
    });
    expect(v?.stock).toBe(25);
    expect(wi?.stock).toBe(25);
    expect(v?.reservedStock).toBe(0);
    expect(wi?.reserved).toBe(0);

    await assertAllInvariants();
  });

  it('factories: makeShoppersOnSameSKU seeds N shoppers sharing one variant', async () => {
    const fx = await makeShoppersOnSameSKU(5, { stock: 10, cartQty: 1 });
    expect(fx.shoppers).toHaveLength(5);
    expect(new Set(fx.shoppers.map((s) => s.userId)).size).toBe(5);
    expect(fx.variantId).toBeGreaterThan(0);
    await assertAllInvariants();
  });

  it('factories: ensureDefaultWarehouse is idempotent', async () => {
    const a = await ensureDefaultWarehouse();
    const b = await ensureDefaultWarehouse();
    expect(a).toBe(b);
  });

  it('invariants: assertI1/I2 detect manual cache corruption', async () => {
    const s = await makeShopper({ stock: 10 });
    await prisma.variant.update({
      where: { id: s.variant.id },
      data: { stock: 999 }, // intentional drift
    });
    await expect(assertI1()).rejects.toThrow(/I-1 VIOLATION/);
    // I-2 should still hold (reservedStock untouched).
    await assertI2();
  });

  it('concurrency: parallel returns accurate fulfilled/rejected counts', async () => {
    const r = await parallel(10, async (i) => {
      if (i % 2 === 0) return i;
      throw new Error(`fail-${i}`);
    });
    expect(r.counts.fulfilled).toBe(5);
    expect(r.counts.rejected).toBe(5);
    expect(r.counts.total).toBe(10);
    expect(isRaceResult(r, { fulfilled: 5, rejectionSubstring: 'fail-' })).toBe(true);
  });

  it('concurrency: barrier releases all waiters together', async () => {
    const b = barrier(3);
    const order: number[] = [];
    await Promise.all([
      (async () => { await b.wait(); order.push(1); })(),
      (async () => { await b.wait(); order.push(2); })(),
      (async () => { await b.wait(); order.push(3); })(),
    ]);
    expect(order.sort()).toEqual([1, 2, 3]);
  });

  it('time: freezeDate/advanceDate/unfreezeDate round-trip', () => {
    const t0 = new Date('2026-01-01T00:00:00Z');
    freezeDate(t0);
    expect(Date.now()).toBe(t0.getTime());
    advanceDate(5_000);
    expect(Date.now()).toBe(t0.getTime() + 5_000);
    unfreezeDate();
    // Real time has moved on — at minimum it is >= t0 + 5s since we advanced.
    expect(Date.now()).toBeGreaterThan(t0.getTime());
  });
});
