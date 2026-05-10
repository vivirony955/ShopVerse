// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * QA Phase-2 — E-series invariant guard tests.
 *
 * Validates that the raw-SQL invariant detectors in helpers/invariants.ts
 * (which mirror InvariantValidatorService) actually fire on corruption
 * and stay quiet on clean state.
 *
 * These are NOT end-to-end order/refund flow tests — those come in
 * PHASE-3 (concurrency) and PHASE-4 (failure injection). Here we take
 * the shortest path to each invariant: seed a clean graph via factories,
 * then directly poke the DB to violate one invariant at a time and
 * confirm the matching asserter throws.
 *
 * Mapping:
 *   QA-E-01 → I-1 stock cache drift
 *   QA-E-02 → I-2 reserved cache drift + orders-vs-cache drift
 *   QA-E-03 → I-3 wallet trial balance drift
 *   QA-E-07 → I-7 refund sum > order.total
 *   QA-E-08 → I-8 expired ACTIVE reservation
 *   QA-E-09 → I-9 coupon usedCount > maxUses
 *   QA-E-14 → WI drift recovery (corrupt → recover → clean)
 *
 * Deferred to later phases (need full service path):
 *   I-4 ledger double-entry, I-5 order total formula, I-6 webhook dedupe,
 *   I-11 refund FK (enforced by schema FK already), I-12 reference uniqueness
 *   (enforced by @@unique), I-13 invoice sequence (Invoice model pending).
 */
import { cleanDatabase, prisma } from './helpers/db';
import { cleanQATables, makeShopper, ensureDefaultWarehouse, seedInventory } from './helpers/factories';
import {
  assertAllInvariants,
  assertI1,
  assertI2,
  assertI3,
  assertI7,
  assertI8,
  assertI9,
} from './helpers/invariants';

describe('QA Phase-2: E-series invariant guards', () => {
  beforeEach(async () => {
    await cleanQATables();
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanQATables();
    await cleanDatabase();
    await prisma.$disconnect();
  });

  // ─── I-1: stock cache drift (QA-E-01) ─────────────────────────────────────

  describe('I-1: Variant.stock <-> WarehouseInventory.stock', () => {
    it('passes on clean seed', async () => {
      await makeShopper({ stock: 25 });
      await assertI1();
    });

    it('detects Variant.stock drift (cache > authoritative)', async () => {
      const s = await makeShopper({ stock: 10 });
      await prisma.variant.update({ where: { id: s.variant.id }, data: { stock: 99 } });
      await expect(assertI1()).rejects.toThrow(/I-1 VIOLATION/);
    });

    it('detects WarehouseInventory.stock drift (authoritative > cache)', async () => {
      const s = await makeShopper({ stock: 10 });
      await prisma.warehouseInventory.update({
        where: { warehouseId_variantId: { warehouseId: s.warehouseId, variantId: s.variant.id } },
        data: { stock: 1 },
      });
      await expect(assertI1()).rejects.toThrow(/I-1 VIOLATION/);
    });
  });

  // ─── I-2: reservedStock cache + orders-vs-cache (QA-E-02) ────────────────

  describe('I-2: reserved cache + active-order tally', () => {
    it('passes on clean seed', async () => {
      await makeShopper({ stock: 20, reserved: 0 });
      await assertI2();
    });

    it('detects cache drift when Variant.reservedStock diverges from WI.reserved', async () => {
      const s = await makeShopper({ stock: 20, reserved: 5 });
      await prisma.variant.update({
        where: { id: s.variant.id },
        data: { reservedStock: 0 }, // cache claims 0, WI says 5
      });
      await expect(assertI2()).rejects.toThrow(/I-2 VIOLATION \(cache\)/);
    });

    it('detects orders-vs-cache drift when active OrderItem qty exceeds reservedStock', async () => {
      // Seed a shopper and create an active Order with 8 items against a
      // variant whose reservedStock cache is only 3.
      const s = await makeShopper({ stock: 20, reserved: 3 });
      await prisma.order.create({
        data: {
          userId: s.user.id,
          addressSnapshot: {},
          subtotal: 800,
          total: 800,
          status: 'CONFIRMED',
          items: {
            create: [{ variantId: s.variant.id, quantity: 8, price: 100 }],
          },
        },
      });
      await expect(assertI2()).rejects.toThrow(/I-2 VIOLATION \(orders vs cache\)/);
    });
  });

  // ─── I-3: wallet trial balance (QA-E-03) ─────────────────────────────────

  describe('I-3: Wallet.balance == sum(WalletTransaction signed amounts)', () => {
    it('passes when balance matches ledger', async () => {
      const s = await makeShopper({ stock: 5, walletBalance: 0 });
      const wallet = await prisma.wallet.findUnique({ where: { userId: s.user.id } });
      await prisma.wallet.update({
        where: { id: wallet!.id },
        data: { balance: 100 },
      });
      await prisma.walletTransaction.create({
        data: {
          walletId: wallet!.id,
          amount: 100,
          type: 'CREDIT',
          reference: `manual:${Date.now()}`,
          balanceAfter: 100,
        },
      });
      await assertI3();
    });

    it('detects balance vs ledger mismatch', async () => {
      const s = await makeShopper({ stock: 5, walletBalance: 0 });
      const wallet = await prisma.wallet.findUnique({ where: { userId: s.user.id } });
      await prisma.wallet.update({
        where: { id: wallet!.id },
        data: { balance: 500 }, // claim 500 in balance
      });
      await prisma.walletTransaction.create({
        data: {
          walletId: wallet!.id,
          amount: 100, // but only 100 in the ledger
          type: 'CREDIT',
          reference: `manual:${Date.now()}`,
          balanceAfter: 100,
        },
      });
      await expect(assertI3()).rejects.toThrow(/I-3 VIOLATION/);
    });
  });

  // ─── I-7: refund bounded by order total (QA-E-07) ────────────────────────

  describe('I-7: sum(COMPLETED refunds) <= Order.total', () => {
    it('detects over-refund', async () => {
      const s = await makeShopper({ stock: 5 });
      const order = await prisma.order.create({
        data: {
          userId: s.user.id,
          addressSnapshot: {},
          subtotal: 500,
          total: 500,
          status: 'DELIVERED',
          paymentStatus: 'REFUNDED',
          items: {
            create: [{ variantId: s.variant.id, quantity: 5, price: 100 }],
          },
        },
      });
      // Single COMPLETED refund for 600 > order total 500
      await prisma.refundRequest.create({
        data: {
          orderId: order.id,
          amount: 600,
          status: 'COMPLETED',
          reference: `refund:over:${Date.now()}`,
          processedAt: new Date(),
        },
      });
      await expect(assertI7()).rejects.toThrow(/I-7 VIOLATION/);
    });
  });

  // ─── I-8: no stale ACTIVE reservations (QA-E-08) ─────────────────────────

  describe('I-8: ACTIVE CartReservation.expiresAt > now (older than 120s)', () => {
    it('detects ACTIVE reservation whose expiresAt is way in the past', async () => {
      const s = await makeShopper({ stock: 10 });
      await prisma.cartReservation.create({
        data: {
          userId: s.user.id,
          cartId: s.cartId,
          status: 'ACTIVE',
          isFlash: false,
          expiresAt: new Date(Date.now() - 10 * 60_000), // 10min in past
          items: {
            create: [
              {
                variantId: s.variant.id,
                warehouseId: s.warehouseId,
                quantity: 1,
                lockedPrice: 100,
                lockedMrp: 100,
              },
            ],
          },
        },
      });
      await expect(assertI8()).rejects.toThrow(/I-8 VIOLATION/);
    });
  });

  // ─── I-9: coupon usedCount <= maxUses (QA-E-09) ──────────────────────────

  describe('I-9: Coupon.usedCount <= Coupon.maxUses', () => {
    it('detects over-used coupon', async () => {
      await prisma.coupon.create({
        data: {
          code: `OVERUSED_${Date.now()}`,
          discountType: 'PERCENTAGE',
          discountValue: 10,
          maxUses: 5,
          usedCount: 7, // breach
        },
      });
      await expect(assertI9()).rejects.toThrow(/I-9 VIOLATION/);
    });
  });

  // ─── QA-E-14: WI drift recovery loop ─────────────────────────────────────

  describe('QA-E-14: WI drift recovery', () => {
    it('detects corruption then recovers via resync SQL', async () => {
      const s = await makeShopper({ stock: 20, reserved: 4 });

      // Corrupt: set Variant cache to bogus values.
      await prisma.variant.update({
        where: { id: s.variant.id },
        data: { stock: 999, reservedStock: 999 },
      });
      await expect(assertAllInvariants()).rejects.toThrow(/I-1 VIOLATION/);

      // Recovery SQL from docs/runbooks/wi-drift.md — targeted resync for one variant.
      await prisma.$executeRaw`
        UPDATE "Variant" v
        SET "stock" = COALESCE(agg.s, 0),
            "reservedStock" = COALESCE(agg.r, 0)
        FROM (
          SELECT "variantId", SUM("stock")::int AS s, SUM("reserved")::int AS r
          FROM "WarehouseInventory"
          WHERE "variantId" = ${s.variant.id}
          GROUP BY "variantId"
        ) agg
        WHERE v.id = agg."variantId"
      `;

      // After resync, all invariants hold.
      await assertAllInvariants();
    });
  });
});
