// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * Exchange — E2E spec
 *
 * Covers: happy path, non-DELIVERED blocked, wrong user blocked,
 * different product variant blocked, duplicate exchange blocked,
 * admin status transitions.
 */
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import { prisma, cleanDatabase, createUser, createAddress } from './helpers/db';
import {
  cleanQATables,
  makeShopper,
  ensureDefaultWarehouse,
  seedInventory,
} from './helpers/factories';
import { ExchangeService } from '../backend/src/exchange/exchange.service';
import { OrdersService } from '../backend/src/orders/orders.service';
import { CartReservationService } from '../backend/src/cart/cart-reservation.service';
import { createCategory, createBrand, createProduct, createVariant } from './helpers/db';

let app: INestApplication;
let exchangeSvc: ExchangeService;
let ordersSvc: OrdersService;
let reservationSvc: CartReservationService;

beforeAll(async () => {
  app = await getTestApp();
  exchangeSvc = app.get(ExchangeService);
  ordersSvc = app.get(OrdersService);
  reservationSvc = app.get(CartReservationService);
});

afterAll(async () => {
  await closeTestApp();
});

beforeEach(async () => {
  await cleanQATables();
  await cleanDatabase();
});

async function makeDeliveredOrder() {
  const s = await makeShopper({ stock: 10, cartQty: 1, basePrice: 800 });
  const res = await reservationSvc.createReservation(s.user.id);
  const order = await ordersSvc.placeOrder(s.user.id, {
    addressId: s.address.id,
    reservationId: res.reservationId,
  });
  await ordersSvc.updateOrderStatus(order.id, 'CONFIRMED');
  await ordersSvc.updateOrderStatus(order.id, 'SHIPPED');
  await ordersSvc.updateOrderStatus(order.id, 'DELIVERED');

  // Get full order with items
  const fullOrder = await prisma.order.findUnique({
    where: { id: order.id },
    include: { items: true },
  });
  return { s, order: fullOrder! };
}

// ─── EXCH-H01: happy path — request exchange on delivered order ─────────────

it('EXCH-H01: request exchange on delivered order creates ExchangeRequest', async () => {
  const { s, order } = await makeDeliveredOrder();
  const whId = await ensureDefaultWarehouse();
  const cat = await createCategory();
  const brand = await createBrand();
  const product = await createProduct(cat.id, brand.id);
  const variantL = await createVariant(product.id, { size: 'L', stock: 5 });
  await seedInventory(whId, variantL.id, 5);

  // original item's variant is from s.variant — get same product's other size
  // We need a variant in the same product. Use the shopper's product:
  const altVariant = await prisma.variant.create({
    data: {
      productId: s.product.id,
      size: 'XL',
      color: 'Blue',
      sku: `SKU-XL-${Date.now()}`,
      stock: 5,
    },
  });

  const orderItemId = order.items[0].id;
  const exchange = await exchangeSvc.request(s.user.id, {
    orderId: order.id,
    orderItemId,
    requestedVariantId: altVariant.id,
    reason: 'Wrong size',
  });

  expect(exchange.id).toBeDefined();
  expect(exchange.status).toBe('PENDING');
  expect(exchange.reason).toBe('Wrong size');
  expect(exchange.orderId).toBe(order.id);
});

// ─── EXCH-E01: exchange on PENDING order → rejected ─────────────────────────

it('EXCH-E01: exchange request on PENDING order is rejected', async () => {
  const s = await makeShopper({ stock: 10, cartQty: 1 });
  const res = await reservationSvc.createReservation(s.user.id);
  const order = await ordersSvc.placeOrder(s.user.id, {
    addressId: s.address.id,
    reservationId: res.reservationId,
  });

  const altVariant = await prisma.variant.create({
    data: {
      productId: s.product.id,
      size: 'XL',
      color: 'Black',
      sku: `SKU-ALT-${Date.now()}`,
      stock: 5,
    },
  });

  await expect(
    exchangeSvc.request(s.user.id, {
      orderId: order.id,
      orderItemId: order.items[0].id,
      requestedVariantId: altVariant.id,
      reason: 'Wrong size',
    }),
  ).rejects.toThrow(/delivered/i);
});

// ─── EXCH-E02: exchange on SHIPPED order → rejected ─────────────────────────

it('EXCH-E02: exchange request on SHIPPED order is rejected', async () => {
  const s = await makeShopper({ stock: 10, cartQty: 1 });
  const res = await reservationSvc.createReservation(s.user.id);
  const order = await ordersSvc.placeOrder(s.user.id, {
    addressId: s.address.id,
    reservationId: res.reservationId,
  });
  await ordersSvc.updateOrderStatus(order.id, 'CONFIRMED');
  await ordersSvc.updateOrderStatus(order.id, 'SHIPPED');

  const altVariant = await prisma.variant.create({
    data: {
      productId: s.product.id,
      size: 'M',
      color: 'Black',
      sku: `SKU-ALTSHIP-${Date.now()}`,
      stock: 5,
    },
  });

  await expect(
    exchangeSvc.request(s.user.id, {
      orderId: order.id,
      orderItemId: order.items[0].id,
      requestedVariantId: altVariant.id,
      reason: 'Wrong size',
    }),
  ).rejects.toThrow(/delivered/i);
});

// ─── EXCH-E03: wrong user → ForbiddenException ──────────────────────────────

it('EXCH-E03: exchange request by wrong user is forbidden', async () => {
  const { s, order } = await makeDeliveredOrder();
  const otherUser = await createUser();
  const altVariant = await prisma.variant.create({
    data: {
      productId: s.product.id,
      size: 'XS',
      color: 'Red',
      sku: `SKU-WRONG-${Date.now()}`,
      stock: 5,
    },
  });

  await expect(
    exchangeSvc.request(otherUser.id, {
      orderId: order.id,
      orderItemId: order.items[0].id,
      requestedVariantId: altVariant.id,
      reason: 'Test',
    }),
  ).rejects.toThrow(/forbidden/i);
});

// ─── EXCH-E04: different product variant → rejected ─────────────────────────

it('EXCH-E04: exchange for variant of different product is rejected', async () => {
  const { s, order } = await makeDeliveredOrder();

  // Create a variant belonging to a completely different product
  const cat = await createCategory();
  const brand = await createBrand();
  const otherProduct = await createProduct(cat.id, brand.id);
  const diffVariant = await prisma.variant.create({
    data: {
      productId: otherProduct.id,
      size: 'M',
      color: 'Blue',
      sku: `SKU-DIFF-${Date.now()}`,
      stock: 5,
    },
  });

  await expect(
    exchangeSvc.request(s.user.id, {
      orderId: order.id,
      orderItemId: order.items[0].id,
      requestedVariantId: diffVariant.id,
      reason: 'Want different product',
    }),
  ).rejects.toThrow(/same product/i);
});

// ─── EXCH-E05: duplicate exchange request → rejected ────────────────────────

it('EXCH-E05: duplicate exchange request for same item is rejected', async () => {
  const { s, order } = await makeDeliveredOrder();
  const altVariant = await prisma.variant.create({
    data: {
      productId: s.product.id,
      size: 'XXL',
      color: 'Black',
      sku: `SKU-DUP-${Date.now()}`,
      stock: 5,
    },
  });

  const orderItemId = order.items[0].id;
  await exchangeSvc.request(s.user.id, {
    orderId: order.id,
    orderItemId,
    requestedVariantId: altVariant.id,
    reason: 'First request',
  });

  await expect(
    exchangeSvc.request(s.user.id, {
      orderId: order.id,
      orderItemId,
      requestedVariantId: altVariant.id,
      reason: 'Duplicate request',
    }),
  ).rejects.toThrow(/already requested/i);
});

// ─── EXCH-H02: admin status update ──────────────────────────────────────────

it('EXCH-H02: admin can update exchange status to APPROVED', async () => {
  const { s, order } = await makeDeliveredOrder();
  const altVariant = await prisma.variant.create({
    data: {
      productId: s.product.id,
      size: 'L',
      color: 'White',
      sku: `SKU-ADMIN-${Date.now()}`,
      stock: 5,
    },
  });

  const exchange = await exchangeSvc.request(s.user.id, {
    orderId: order.id,
    orderItemId: order.items[0].id,
    requestedVariantId: altVariant.id,
    reason: 'Wrong size received',
  });

  const updated = await exchangeSvc.updateStatus(exchange.id, 'APPROVED', 'Approved by CS');
  expect(updated.status).toBe('APPROVED');
  expect(updated.adminNote).toBe('Approved by CS');
});

// ─── EXCH-H03: getForOrder returns user's exchanges ────────────────────────

it('EXCH-H03: getForOrder returns exchange requests for the order', async () => {
  const { s, order } = await makeDeliveredOrder();
  const altVariant = await prisma.variant.create({
    data: {
      productId: s.product.id,
      size: 'S',
      color: 'Green',
      sku: `SKU-LIST-${Date.now()}`,
      stock: 5,
    },
  });

  await exchangeSvc.request(s.user.id, {
    orderId: order.id,
    orderItemId: order.items[0].id,
    requestedVariantId: altVariant.id,
    reason: 'Size issue',
  });

  const list = await exchangeSvc.getForOrder(s.user.id, order.id);
  expect(list).toHaveLength(1);
  expect(list[0].reason).toBe('Size issue');
});

// ─── EXCH-E06: getForOrder by wrong user → ForbiddenException ───────────────

it('EXCH-E06: getForOrder by wrong user is forbidden', async () => {
  const { order } = await makeDeliveredOrder();
  const otherUser = await createUser();

  await expect(
    exchangeSvc.getForOrder(otherUser.id, order.id),
  ).rejects.toThrow(/forbidden/i);
});
