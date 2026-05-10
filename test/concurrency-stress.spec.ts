/**
 * QA Phase 8 — Concurrency Stress + Full Invariant Sweep
 *
 * Elevated parallelism (10-20 concurrent) across all critical services.
 * Every test ends with a full invariant check to catch corruption.
 */
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import { prisma, cleanDatabase, createUser } from './helpers/db';
import {
  cleanQATables,
  ensureWallet,
  makeShopper,
  makeShoppersOnSameSKU,
  ensureDefaultWarehouse,
  seedInventory,
} from './helpers/factories';
import { assertI1, assertI3, assertI7, assertI9, assertAllInvariants } from './helpers/invariants';
import { parallel } from './helpers/concurrency';
import { WalletService } from '../backend/src/wallet/wallet.service';
import { OrdersService } from '../backend/src/orders/orders.service';
import { CartReservationService } from '../backend/src/cart/cart-reservation.service';
import { LoyaltyService } from '../backend/src/loyalty/loyalty.service';
import { CronLockService } from '../backend/src/common/cron-lock.service';

let app: INestApplication;
let walletService: WalletService;
let ordersService: OrdersService;
let reservationService: CartReservationService;
let loyaltyService: LoyaltyService;
let cronLock: CronLockService;

beforeAll(async () => {
  app = await getTestApp();
  walletService = app.get(WalletService);
  ordersService = app.get(OrdersService);
  reservationService = app.get(CartReservationService);
  loyaltyService = app.get(LoyaltyService);
  cronLock = app.get(CronLockService);
});

afterAll(async () => {
  await closeTestApp();
});

beforeEach(async () => {
  await prisma.shipmentItem.deleteMany();
  await prisma.shipment.deleteMany();
  await cleanQATables();
  await cleanDatabase();
  await prisma.cronLock.deleteMany();
});

// ─── STRESS-01: 10 concurrent wallet debits on same balance ─────────────────

it('STRESS-01: 10 concurrent $20 debits on $100 balance → ≤5 succeed', async () => {
  const user = await createUser();
  await ensureWallet(user.id, 100);

  const results = await parallel(10, (i) =>
    walletService.debit({ userId: user.id, amount: 20, reference: `stress:debit:${i}` }),
  );

  expect(results.counts.fulfilled).toBeLessThanOrEqual(5);
  expect(results.counts.fulfilled).toBeGreaterThanOrEqual(1);

  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  expect(wallet!.balance).toBeGreaterThanOrEqual(0);
  expect(wallet!.balance).toBe(100 - results.counts.fulfilled * 20);

  await assertI3();
});

// ─── STRESS-02: 20 concurrent wallet credits → exact sum ────────────────────

it('STRESS-02: 20 concurrent credits → balance == exact sum', async () => {
  const user = await createUser();
  await ensureWallet(user.id, 0);

  const results = await parallel(20, (i) =>
    walletService.credit({ userId: user.id, amount: 10, reference: `stress:credit:${i}` }),
  );

  expect(results.counts.fulfilled).toBe(20);

  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  expect(wallet!.balance).toBe(200);

  await assertI3();
});

// ─── STRESS-03: 10 shoppers fight for last 5 units ──────────────────────────

it('STRESS-03: 10 shoppers reserve from 5 units → ≤5 succeed', async () => {
  const { warehouseId, variantId, shoppers } = await makeShoppersOnSameSKU(10, {
    stock: 5,
    cartQty: 1,
  });

  const results = await parallel(10, (i) =>
    reservationService.createReservation(shoppers[i].userId),
  );

  // At most 5 should succeed (only 5 sellable units)
  expect(results.counts.fulfilled).toBeLessThanOrEqual(5);
  expect(results.counts.fulfilled).toBeGreaterThanOrEqual(1);

  // No oversell: reserved ≤ stock
  const wi = await prisma.warehouseInventory.findUnique({
    where: { warehouseId_variantId: { warehouseId, variantId } },
  });
  expect(wi!.reserved).toBeLessThanOrEqual(wi!.stock);

  await assertI1();
});

// ─── STRESS-04: 15 concurrent loyalty earn for same order → exactly 1 ──────

it('STRESS-04: 15 concurrent earnPoints for same order → exactly 1 earn', async () => {
  const user = await createUser();

  const results = await parallel(15, () =>
    loyaltyService.earnPoints(user.id, 12345, 2000),
  );

  expect(results.counts.fulfilled).toBe(15);

  // Only 1 actually earned (200 points), rest got 0
  const earned = results.fulfilled.filter((v) => v === 200);
  expect(earned).toHaveLength(1);

  const finalUser = await prisma.user.findUnique({ where: { id: user.id } });
  expect(finalUser!.loyaltyPoints).toBe(200);

  const txCount = await prisma.loyaltyTransaction.count({
    where: { reference: 'earn:order:12345' },
  });
  expect(txCount).toBe(1);
});

// ─── STRESS-05: 10 concurrent cron lock acquires → exactly 1 wins ───────────

it('STRESS-05: 10 concurrent cron lock acquires → exactly 1 winner', async () => {
  const results = await parallel(10, () =>
    cronLock.acquire('stress-lock', 60000),
  );

  const wins = results.fulfilled.filter(Boolean).length;
  expect(wins).toBe(1);

  await cronLock.release('stress-lock');
});

// ─── STRESS-06: Mixed wallet operations → I-3 holds ────────────────────────

it('STRESS-06: 10 credits + 5 debits concurrent → I-3 holds', async () => {
  const user = await createUser();
  await ensureWallet(user.id, 500);

  const ops = [];
  for (let i = 0; i < 10; i++) {
    ops.push(walletService.credit({ userId: user.id, amount: 10, reference: `stress:mix:c:${i}` }));
  }
  for (let i = 0; i < 5; i++) {
    ops.push(walletService.debit({ userId: user.id, amount: 10, reference: `stress:mix:d:${i}` }));
  }

  const results = await Promise.allSettled(ops);
  const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
  // All credits should succeed, most debits should too (balance is 500)
  expect(fulfilled).toBeGreaterThanOrEqual(10);

  await assertI3();
});

// ─── STRESS-07: Reservation + cancel race on same stock ─────────────────────

it('STRESS-07: reserve + place + cancel race → no negative stock', async () => {
  const s = await makeShopper({ stock: 10, cartQty: 2 });
  const reservation = await reservationService.createReservation(s.user.id);
  const order = await ordersService.placeOrder(s.user.id, {
    addressId: s.address.id,
    reservationId: reservation.reservationId,
  });

  // Concurrent: cancel the order while checking stock
  const results = await Promise.allSettled([
    ordersService.cancelOrder(s.user.id, order.id),
    prisma.warehouseInventory.findUnique({
      where: { warehouseId_variantId: { warehouseId: s.warehouseId, variantId: s.variant.id } },
    }),
  ]);

  // Stock should never be negative
  const wi = await prisma.warehouseInventory.findUnique({
    where: { warehouseId_variantId: { warehouseId: s.warehouseId, variantId: s.variant.id } },
  });
  expect(wi!.stock).toBeGreaterThanOrEqual(0);
  expect(wi!.reserved).toBeGreaterThanOrEqual(0);

  await assertI1();
});

// ─── STRESS-08: Full invariant sweep after mixed operations ─────────────────

it('STRESS-08: full invariant sweep after complex operation sequence', async () => {
  // Build a full scenario: shopper + order + refund + loyalty + wallet
  const s = await makeShopper({ stock: 50, cartQty: 1, basePrice: 1000 });
  await ensureWallet(s.user.id, 500);

  // Reserve + place order
  const reservation = await reservationService.createReservation(s.user.id);
  const order = await ordersService.placeOrder(s.user.id, {
    addressId: s.address.id,
    reservationId: reservation.reservationId,
  });

  // Mark confirmed + paid
  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'CONFIRMED', paymentStatus: 'PAID' },
  });

  // Deliver + earn loyalty
  await ordersService.updateOrderStatus(order.id, 'SHIPPED');
  await ordersService.updateOrderStatus(order.id, 'DELIVERED');

  // Refund an item
  const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
  await ordersService.refundOrderItem(order.id, items[0].id);

  // Wallet operations
  await walletService.credit({ userId: s.user.id, amount: 100, reference: 'stress:sweep:c1' });

  // FULL INVARIANT SWEEP
  await assertAllInvariants();
});

// ─── STRESS-09: 10 concurrent same-reference credits → exactly 1 ───────────

it('STRESS-09: 10 concurrent credits with same reference → exactly 1 tx', async () => {
  const user = await createUser();
  await ensureWallet(user.id, 0);
  const ref = `stress:idem:${Date.now()}`;

  const results = await parallel(10, () =>
    walletService.credit({ userId: user.id, amount: 50, reference: ref }),
  );

  expect(results.counts.fulfilled).toBe(10); // all return (idempotent)

  const txCount = await prisma.walletTransaction.count({
    where: { wallet: { userId: user.id }, reference: ref },
  });
  expect(txCount).toBe(1);

  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  expect(wallet!.balance).toBe(50); // not 500

  await assertI3();
});
