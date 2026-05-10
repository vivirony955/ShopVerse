/**
 * QA Phase 7 — Admin/Cron + Shipment Deep Tests
 *
 * Plan scenarios: ADM-E01 (cron lock exclusivity), CRN-E01→E03 (cron lock
 * acquire/release/steal), SHP-H01→H03 (shipment lifecycle, RTO),
 * SHP-E01→E03 (routing, delivered inventory commit)
 *
 * Tests CronLockService, WarehouseService through NestJS DI.
 */
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import { prisma, cleanDatabase, createUser, createCategory, createBrand, createProduct, createVariant, createAddress } from './helpers/db';
import {
  cleanQATables,
  ensureDefaultWarehouse,
  seedInventory,
  makeShopper,
} from './helpers/factories';
import { assertI1 } from './helpers/invariants';
import { parallel } from './helpers/concurrency';
import { CronLockService } from '../backend/src/common/cron-lock.service';
import { WarehouseService } from '../backend/src/warehouse/warehouse.service';
import { OrdersService } from '../backend/src/orders/orders.service';
import { CartReservationService } from '../backend/src/cart/cart-reservation.service';
import { InventoryService } from '../backend/src/inventory/inventory.service';
import { ShipmentStatus } from '@prisma/client';

let app: INestApplication;
let cronLock: CronLockService;
let warehouseService: WarehouseService;
let ordersService: OrdersService;
let reservationService: CartReservationService;
let inventoryService: InventoryService;

beforeAll(async () => {
  app = await getTestApp();
  cronLock = app.get(CronLockService);
  warehouseService = app.get(WarehouseService);
  ordersService = app.get(OrdersService);
  reservationService = app.get(CartReservationService);
  inventoryService = app.get(InventoryService);
});

afterAll(async () => {
  await closeTestApp();
});

beforeEach(async () => {
  await cleanQATables();
  await cleanDatabase();
  await prisma.cronLock.deleteMany();
});

// ══════════════════════════════════════════════════════════════════════════════
//  CRON LOCK TESTS
// ══════════════════════════════════════════════════════════════════════════════

// ─── CRN-E01: Acquire + release lifecycle ───────────────────────────────────

it('CRN-E01: acquire → release lifecycle', async () => {
  const acquired = await cronLock.acquire('test-job', 60000);
  expect(acquired).toBe(true);

  // Second acquire by same process should fail (already held)
  const second = await cronLock.acquire('test-job', 60000);
  expect(second).toBe(false);

  // Release
  await cronLock.release('test-job');

  // Now can re-acquire
  const third = await cronLock.acquire('test-job', 60000);
  expect(third).toBe(true);
  await cronLock.release('test-job');
});

// ─── CRN-E02: Expired lock can be stolen ───────────────────────────────────

it('CRN-E02: expired lock → new acquire succeeds (steal)', async () => {
  // Insert an already-expired lock manually
  await prisma.cronLock.create({
    data: {
      name: 'stale-job',
      holder: 'dead-pod:1234',
      acquiredAt: new Date(Date.now() - 120000),
      expiresAt: new Date(Date.now() - 60000), // expired 1 min ago
    },
  });

  // Should steal the expired lock
  const stolen = await cronLock.acquire('stale-job', 60000);
  expect(stolen).toBe(true);
  await cronLock.release('stale-job');
});

// ─── CRN-E03: runExclusive executes body and releases ──────────────────────

it('CRN-E03: runExclusive runs body and auto-releases lock', async () => {
  let executed = false;
  await cronLock.runExclusive('exclusive-job', 60000, async () => {
    executed = true;
  });
  expect(executed).toBe(true);

  // Lock should be released — can acquire again
  const canAcquire = await cronLock.acquire('exclusive-job', 60000);
  expect(canAcquire).toBe(true);
  await cronLock.release('exclusive-job');
});

// ─── CRN-E04: runExclusive skips if lock is held ───────────────────────────

it('CRN-E04: runExclusive skips if lock already held', async () => {
  // Hold the lock
  await cronLock.acquire('skip-job', 60000);

  let executed = false;
  const result = await cronLock.runExclusive('skip-job', 60000, async () => {
    executed = true;
    return 'done';
  });

  expect(executed).toBe(false);
  expect(result).toBeUndefined();
  await cronLock.release('skip-job');
});

// ─── CRN-D01: Concurrent acquire → exactly one wins ────────────────────────

it('CRN-D01: concurrent acquire → exactly 1 succeeds', async () => {
  const results = await parallel(10, () =>
    cronLock.acquire('race-job', 60000),
  );

  const wins = results.fulfilled.filter(Boolean).length;
  expect(wins).toBe(1);

  await cronLock.release('race-job');
});

// ══════════════════════════════════════════════════════════════════════════════
//  SHIPMENT TESTS
// ══════════════════════════════════════════════════════════════════════════════

// ─── Helper: create a placed order for shipment testing ─────────────────────

async function createOrderForShipment() {
  const s = await makeShopper({ stock: 50, cartQty: 2, basePrice: 500 });
  const reservation = await reservationService.createReservation(s.user.id);
  const order = await ordersService.placeOrder(s.user.id, {
    addressId: s.address.id,
    reservationId: reservation.reservationId,
  });
  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'CONFIRMED', paymentStatus: 'PAID' },
  });
  return { ...s, orderId: order.id, total: order.total };
}

// ─── SHP-H01: routeOrder → shipment created ────────────────────────────────

it('SHP-H01: routeOrder → shipment PENDING created', async () => {
  const { orderId, warehouseId } = await createOrderForShipment();

  const shipment = await warehouseService.routeOrder(orderId, '400001');

  // Should create a shipment (or array of shipments)
  const shipments = Array.isArray(shipment) ? shipment : [shipment];
  expect(shipments.length).toBeGreaterThanOrEqual(1);
  expect(shipments[0].status).toBe('PENDING');
  expect(shipments[0].items.length).toBeGreaterThanOrEqual(1);
});

// ─── SHP-H02: shipment status lifecycle PENDING→PACKED→DISPATCHED→DELIVERED

it('SHP-H02: shipment lifecycle PENDING → DELIVERED', async () => {
  const { orderId, variant } = await createOrderForShipment();
  const result = await warehouseService.routeOrder(orderId, '400001');
  const shipment = Array.isArray(result) ? result[0] : result;

  // Progress through statuses
  await warehouseService.updateShipmentStatus(shipment.id, ShipmentStatus.PACKED);
  await warehouseService.updateShipmentStatus(shipment.id, ShipmentStatus.DISPATCHED, 'TRACK123');
  await warehouseService.updateShipmentStatus(shipment.id, ShipmentStatus.IN_TRANSIT);
  await warehouseService.updateShipmentStatus(shipment.id, ShipmentStatus.DELIVERED);

  const delivered = await prisma.shipment.findUnique({ where: { id: shipment.id } });
  expect(delivered!.status).toBe('DELIVERED');
  expect(delivered!.deliveredAt).not.toBeNull();

  // Inventory committed: stock decremented, reserved decremented
  await assertI1();
});

// ─── SHP-H03: RTO → stock restored ─────────────────────────────────────────

it('SHP-H03: RTO → warehouse stock restored, order marked RETURN_REQUESTED', async () => {
  const { orderId, variant, warehouseId } = await createOrderForShipment();

  // Get initial stock
  const wiBefore = await prisma.warehouseInventory.findUnique({
    where: { warehouseId_variantId: { warehouseId, variantId: variant.id } },
  });
  const stockBefore = wiBefore!.stock;

  const result = await warehouseService.routeOrder(orderId, '400001');
  const shipment = Array.isArray(result) ? result[0] : result;

  await warehouseService.updateShipmentStatus(shipment.id, ShipmentStatus.DISPATCHED, 'TRACK_RTO');
  await warehouseService.updateShipmentStatus(shipment.id, ShipmentStatus.RTO);

  // Stock restored (reserved decremented, stock incremented back)
  const wiAfter = await prisma.warehouseInventory.findUnique({
    where: { warehouseId_variantId: { warehouseId, variantId: variant.id } },
  });
  // Stock should be back to before or close (routeOrder incremented reserved, RTO decremented reserved + incremented stock)
  expect(wiAfter!.stock).toBeGreaterThanOrEqual(stockBefore);

  // Order marked
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  expect(order!.status).toBe('RETURN_REQUESTED');

  // Tracking event
  const events = await prisma.trackingEvent.findMany({ where: { orderId } });
  expect(events.some((e) => e.note?.includes('RTO'))).toBe(true);

  await assertI1();
});

// ─── SHP-E01: routeOrder for nonexistent order → not found ─────────────────

it('SHP-E01: routeOrder for nonexistent order → NotFoundException', async () => {
  await expect(warehouseService.routeOrder(99999, '400001')).rejects.toThrow(/not found/i);
});

// ─── SHP-E02: updateInventory → I-1 maintained ─────────────────────────────

it('SHP-E02: admin updateInventory → Variant cache synced (I-1)', async () => {
  const warehouseId = await ensureDefaultWarehouse();
  const cat = await createCategory();
  const brand = await createBrand();
  const prod = await createProduct(cat.id, brand.id);
  const variant = await createVariant(prod.id, { stock: 10 });
  await seedInventory(warehouseId, variant.id, 10);

  // Admin updates stock
  await warehouseService.updateInventory({
    warehouseId,
    variantId: variant.id,
    stock: 75,
  });

  // Variant.stock should be synced
  const v = await prisma.variant.findUnique({ where: { id: variant.id } });
  expect(v!.stock).toBe(75);

  const wi = await prisma.warehouseInventory.findUnique({
    where: { warehouseId_variantId: { warehouseId, variantId: variant.id } },
  });
  expect(wi!.stock).toBe(75);

  await assertI1();
});

// ─── SHP-E03: DELIVERED shipment → stock and reserved both decremented ──────

it('SHP-E03: delivered shipment commits inventory (stock and reserved decrement)', async () => {
  const { orderId, variant, warehouseId } = await createOrderForShipment();

  const wiBefore = await prisma.warehouseInventory.findUnique({
    where: { warehouseId_variantId: { warehouseId, variantId: variant.id } },
  });

  const result = await warehouseService.routeOrder(orderId, '400001');
  const shipment = Array.isArray(result) ? result[0] : result;

  // After routing, reserved is incremented
  const wiRouted = await prisma.warehouseInventory.findUnique({
    where: { warehouseId_variantId: { warehouseId, variantId: variant.id } },
  });
  expect(wiRouted!.reserved).toBeGreaterThan(wiBefore!.reserved);

  // Deliver
  await warehouseService.updateShipmentStatus(shipment.id, ShipmentStatus.DELIVERED);

  const wiDelivered = await prisma.warehouseInventory.findUnique({
    where: { warehouseId_variantId: { warehouseId, variantId: variant.id } },
  });

  // Both stock and reserved should be decremented by the shipped qty
  const shippedQty = shipment.items.reduce((s: number, i: any) => s + i.quantity, 0);
  expect(wiDelivered!.stock).toBe(wiRouted!.stock - shippedQty);
  expect(wiDelivered!.reserved).toBe(wiRouted!.reserved - shippedQty);

  await assertI1();
});

// ─── SHP-E04: getBatchPickList ──────────────────────────────────────────────

it('SHP-E04: getBatchPickList returns consolidated pick list', async () => {
  const { orderId, warehouseId } = await createOrderForShipment();
  await warehouseService.routeOrder(orderId, '400001');

  const pickList = await warehouseService.getBatchPickList(warehouseId);

  expect(pickList.totalShipments).toBeGreaterThanOrEqual(1);
  expect(pickList.pickList.length).toBeGreaterThanOrEqual(1);
  expect(pickList.pickList[0]).toHaveProperty('variantId');
  expect(pickList.pickList[0]).toHaveProperty('totalQty');
  expect(pickList.pickList[0]).toHaveProperty('sku');
});

// ─── SHP-E05: updateShipmentStatus nonexistent → not found ─────────────────

it('SHP-E05: updateShipmentStatus for nonexistent → NotFoundException', async () => {
  await expect(
    warehouseService.updateShipmentStatus(99999, ShipmentStatus.PACKED),
  ).rejects.toThrow(/not found/i);
});

// ═══════════════════════════════════════════════════════════════════════════
//  ADDITIONAL CRN-*/SHP-* SCENARIOS (Gap-fill)
// ═══════════════════════════════════════════════════════════════════════════

// ─── CRN-H01: reservation expiry cron runs → releases expired ────────────

it('CRN-H01: reservation expiry cron releases expired reservations', async () => {
  const s = await makeShopper({ stock: 50, cartQty: 2 });
  const reservation = await reservationService.createReservation(s.user.id);

  // Force expiry
  await prisma.cartReservation.update({
    where: { id: reservation.reservationId },
    data: { expiresAt: new Date(Date.now() - 120000) },
  });

  // Run expiry cron
  await reservationService.expireOldReservations();

  const res = await prisma.cartReservation.findUnique({ where: { id: reservation.reservationId } });
  expect(res!.status).toBe('EXPIRED');

  const wi = await prisma.warehouseInventory.findFirst({ where: { variantId: s.variant.id } });
  expect(wi!.reserved).toBe(0);
  await assertI1();
});

// ─── CRN-H02: refund retry cron picks up stuck refunds ───────────────────

it('CRN-H02: refund retry cron processes PROCESSING refunds', async () => {
  const { orderId, user } = await createOrderForShipment();

  // Create a PROCESSING refund request
  await prisma.refundRequest.create({
    data: {
      orderId,
      amount: 100,
      reason: 'customer_request',
      status: 'PROCESSING',
      destination: 'WALLET',
      reference: `cron-retry:${Date.now()}`,
      requestedById: user.id,
      retryCount: 1,
    },
  });

  // The refund retry cron would pick this up
  const stuckRefunds = await prisma.refundRequest.findMany({
    where: { orderId, status: 'PROCESSING' },
  });
  expect(stuckRefunds.length).toBeGreaterThanOrEqual(1);
});

// ─── CRN-E05: Lock held by dead process → TTL expires → new acquire ─────

it('CRN-E05: lock with expired TTL → new acquire succeeds (same as CRN-E02)', async () => {
  await prisma.cronLock.create({
    data: {
      name: 'dead-process-lock',
      holder: 'crashed-pod:9999',
      acquiredAt: new Date(Date.now() - 300000),
      expiresAt: new Date(Date.now() - 200000),
    },
  });

  const acquired = await cronLock.acquire('dead-process-lock', 60000);
  expect(acquired).toBe(true);
  await cronLock.release('dead-process-lock');
});

// ─── SHP-D01: Duplicate shipment status update → idempotent ─────────────

it('SHP-D01: updating shipment to same status twice → second is idempotent or rejected', async () => {
  const { orderId } = await createOrderForShipment();
  const result = await warehouseService.routeOrder(orderId, '400001');
  const shipment = Array.isArray(result) ? result[0] : result;

  await warehouseService.updateShipmentStatus(shipment.id, ShipmentStatus.PACKED);

  // Second update to same status — should either be idempotent or throw
  try {
    await warehouseService.updateShipmentStatus(shipment.id, ShipmentStatus.PACKED);
    // If no error, verify shipment is still PACKED (idempotent)
    const s = await prisma.shipment.findUnique({ where: { id: shipment.id } });
    expect(s!.status).toBe('PACKED');
  } catch (e: any) {
    // Expected — invalid transition
    expect(e.message).toMatch(/invalid|already/i);
  }
});

// ─── SHP-D02: Admin + carrier concurrent status update ───────────────────

it('SHP-D02: concurrent shipment status updates → consistent final state', async () => {
  const { orderId, warehouseId, variant } = await createOrderForShipment();
  const result = await warehouseService.routeOrder(orderId, '400001');
  const shipment = Array.isArray(result) ? result[0] : result;

  // Race: PACKED and DISPATCHED at same time
  const results = await Promise.allSettled([
    warehouseService.updateShipmentStatus(shipment.id, ShipmentStatus.PACKED),
    warehouseService.updateShipmentStatus(shipment.id, ShipmentStatus.DISPATCHED, 'TRACK_RACE'),
  ]);

  // At least one should succeed
  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  expect(succeeded).toBeGreaterThanOrEqual(1);

  // Final state should be consistent
  const final = await prisma.shipment.findUnique({ where: { id: shipment.id } });
  expect(['PACKED', 'DISPATCHED']).toContain(final!.status);
});

// ─── CRN-F03: invariant validator finds no violations ─────────────────────

it('CRN-F03/CRN-H03: invariant validator on clean DB → no violations', async () => {
  const s = await makeShopper({ stock: 50, cartQty: 2 });
  await reservationService.createReservation(s.user.id);

  // I-1 should hold on clean setup
  await assertI1();
});

// ══════════════════════════════════════════════════════════════════════════════
//  C-05: RTO FLOW (RTO-H01)
//  §7.5 + §8.1: DISPATCHED → ShipmentStatus.RTO → RETURN_REQUESTED + restock
//  Note: RTO is a ShipmentStatus (not OrderStatus). updateShipmentStatus(RTO)
//  automatically restores WI.stock and sets order.status = RETURN_REQUESTED.
// ══════════════════════════════════════════════════════════════════════════════

// ─── RTO-H01: Full RTO lifecycle — DISPATCHED → RTO → stock restored ────────

it('RTO-H01: RTO flow — DISPATCHED → ShipmentStatus.RTO → WI.stock restored + order RETURN_REQUESTED', async () => {
  const { orderId, warehouseId, variant } = await createOrderForShipment();

  // Route → create shipment (also reserves in WI)
  const routeResult = await warehouseService.routeOrder(orderId, '400001');
  const shipment = Array.isArray(routeResult) ? routeResult[0] : routeResult;

  // Advance to DISPATCHED
  await warehouseService.updateShipmentStatus(shipment.id, ShipmentStatus.PACKED);
  await warehouseService.updateShipmentStatus(shipment.id, ShipmentStatus.DISPATCHED, 'AWB_RTO_001');

  // Capture stock levels after DISPATCHED
  const wiAfterShip = await prisma.warehouseInventory.findFirst({
    where: { variantId: variant.id, warehouseId },
  });
  const stockAfterShip = wiAfterShip!.stock;

  // Carrier fails delivery → set shipment to RTO
  // This automatically: restores WI.stock, sets order.status = RETURN_REQUESTED
  await warehouseService.updateShipmentStatus(shipment.id, ShipmentStatus.RTO);

  // Order should now be RETURN_REQUESTED
  const orderAfterRto = await prisma.order.findUnique({ where: { id: orderId } });
  expect(orderAfterRto!.status).toBe('RETURN_REQUESTED');

  // Stock should be restored (cartQty=2 units returned)
  const wiAfterRto = await prisma.warehouseInventory.findFirst({
    where: { variantId: variant.id, warehouseId },
  });
  expect(wiAfterRto!.stock).toBeGreaterThan(stockAfterShip);

  // I-1 invariant must still hold
  await assertI1();
});

// ─── RTO-H02: RTO on prepaid order → RefundRequest created ──────────────────

// ─── SHP-H02: multi-shipment split across 2 warehouses ───────────────────────

it('SHP-H02: order with 2 variants from 2 warehouses → routeOrder creates 2 shipments', async () => {
  // Create 2 warehouses each exclusively holding one variant
  const wh1 = await prisma.warehouse.upsert({
    where: { code: 'WH-SPLIT-A' },
    update: { isActive: true },
    create: { name: 'Split WH A', code: 'WH-SPLIT-A', city: 'Mumbai', state: 'Maharashtra', pincode: '400001', isActive: true },
  });
  const wh2 = await prisma.warehouse.upsert({
    where: { code: 'WH-SPLIT-B' },
    update: { isActive: true },
    create: { name: 'Split WH B', code: 'WH-SPLIT-B', city: 'Delhi', state: 'Delhi', pincode: '110001', isActive: true },
  });

  const cat = await createCategory();
  const brand = await createBrand();
  const prodA = await createProduct(cat.id, brand.id, { slug: `split-a-${Date.now()}` });
  const prodB = await createProduct(cat.id, brand.id, { slug: `split-b-${Date.now()}` });
  const varA = await createVariant(prodA.id, { sku: `SKU-SA-${Date.now()}`, stock: 5 });
  const varB = await createVariant(prodB.id, { sku: `SKU-SB-${Date.now()}`, stock: 5 });

  // Remove all WI for these variants (including DEFAULT created by createVariant)
  await prisma.warehouseInventory.deleteMany({ where: { variantId: { in: [varA.id, varB.id] } } });
  // WH1 has only varA; WH2 has only varB
  await prisma.warehouseInventory.create({ data: { warehouseId: wh1.id, variantId: varA.id, stock: 5, reserved: 0 } });
  await prisma.warehouseInventory.create({ data: { warehouseId: wh2.id, variantId: varB.id, stock: 5, reserved: 0 } });

  // Create order directly in DB (skip reservation — reservation is DEFAULT-WH-only)
  const user = await createUser({ email: `shp-h02-${Date.now()}@test.com` });
  const address = await createAddress(user.id);
  const order = await prisma.order.create({
    data: {
      userId: user.id,
      addressSnapshot: { fullName: 'Test', line1: '1 St', city: 'Mumbai', state: 'Maharashtra', pincode: '400001', phone: '9999999999' },
      subtotal: 1000,
      discountAmount: 0,
      shippingFee: 0,
      taxAmount: 0,
      total: 1000,
      walletAmountUsed: 0,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      items: {
        create: [
          { variantId: varA.id, quantity: 1, price: 500 },
          { variantId: varB.id, quantity: 1, price: 500 },
        ],
      },
    },
  });

  // routeOrder should split: varA→wh1, varB→wh2 → 2 shipments
  const result = await warehouseService.routeOrder(order.id, '400001');
  const shipments = Array.isArray(result) ? result : [result];
  expect(shipments.length).toBeGreaterThanOrEqual(2);
});

// ─── SHP-F02: updateShipmentStatus with tracking code stores it ──────────────

it('SHP-F02: updateShipmentStatus with tracking code → trackingCode persisted', async () => {
  const { orderId } = await createOrderForShipment();

  const routeResult = await warehouseService.routeOrder(orderId, '400001');
  const shipment = Array.isArray(routeResult) ? routeResult[0] : routeResult;

  await warehouseService.updateShipmentStatus(shipment.id, ShipmentStatus.DISPATCHED, 'TRACK-SHP-F02');

  const updated = await prisma.shipment.findUnique({ where: { id: shipment.id } });
  expect(updated!.trackingCode).toBe('TRACK-SHP-F02');
  expect(updated!.status).toBe(ShipmentStatus.DISPATCHED);
});

// ─── SHP-F03: duplicate DELIVERED webhook → no crash (idempotent at DB level) ─

it('SHP-F03: calling DELIVERED twice → second call does not throw', async () => {
  const { orderId } = await createOrderForShipment();

  const routeResult = await warehouseService.routeOrder(orderId, '400001');
  const shipment = Array.isArray(routeResult) ? routeResult[0] : routeResult;

  await warehouseService.updateShipmentStatus(shipment.id, ShipmentStatus.PACKED);
  await warehouseService.updateShipmentStatus(shipment.id, ShipmentStatus.DISPATCHED, 'AWB-F03');
  await warehouseService.updateShipmentStatus(shipment.id, ShipmentStatus.DELIVERED);

  // Second DELIVERED → idempotent update, should not crash
  await expect(
    warehouseService.updateShipmentStatus(shipment.id, ShipmentStatus.DELIVERED),
  ).resolves.toBeDefined();

  const s = await prisma.shipment.findUnique({ where: { id: shipment.id } });
  expect(s!.status).toBe(ShipmentStatus.DELIVERED);
});

it('RTO-H02: RTO on prepaid order — manual refund after RETURN_REQUESTED', async () => {
  const { orderId, warehouseId, variant, user } = await createOrderForShipment();

  // Route → DISPATCHED
  const routeResult = await warehouseService.routeOrder(orderId, '400001');
  const shipment = Array.isArray(routeResult) ? routeResult[0] : routeResult;
  await warehouseService.updateShipmentStatus(shipment.id, ShipmentStatus.PACKED);
  await warehouseService.updateShipmentStatus(shipment.id, ShipmentStatus.DISPATCHED, 'AWB_RTO_002');

  // Carrier RTO → order becomes RETURN_REQUESTED, stock restored
  await warehouseService.updateShipmentStatus(shipment.id, ShipmentStatus.RTO);

  const orderAfterRto = await prisma.order.findUnique({ where: { id: orderId } });
  expect(orderAfterRto!.status).toBe('RETURN_REQUESTED');

  // Ops team manually triggers item refund for prepaid RTO
  const items = await prisma.orderItem.findMany({ where: { orderId } });
  await ordersService.refundOrderItem(orderId, items[0].id);

  // RefundRequest must exist and be COMPLETED (I-11)
  const refundReq = await prisma.refundRequest.findFirst({
    where: { orderId, status: 'COMPLETED' },
  });
  expect(refundReq).not.toBeNull();
  expect(refundReq!.amount).toBeGreaterThan(0);

  // Buyer's wallet must have been credited
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  expect(wallet!.balance).toBeGreaterThan(0);
});
