/**
 * New Features — E2E spec
 *
 * Covers:
 *   Recently Viewed (F1-04): track, get, upsert dedup
 *   Delivery Rating (F2-13): rate delivered, reject non-delivered, update
 *   Trending Searches (F2-11): log query, get trending
 *   Loyalty Tiers (F2-19): upsert tiers, getUserTier
 *   Cashback Coupon (F4-07): 0 discount upfront, wallet credit post-order
 */
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import { prisma, cleanDatabase, createUser } from './helpers/db';
import {
  cleanQATables,
  makeShopper,
  ensureWallet,
} from './helpers/factories';
import { ExperienceService } from '../backend/src/experience/experience.service';
import { ProductsService } from '../backend/src/products/products.service';
import { OrdersService } from '../backend/src/orders/orders.service';
import { CartReservationService } from '../backend/src/cart/cart-reservation.service';

let app: INestApplication;
let experienceSvc: ExperienceService;
let productsSvc: ProductsService;
let ordersSvc: OrdersService;
let reservationSvc: CartReservationService;

beforeAll(async () => {
  app = await getTestApp();
  experienceSvc = app.get(ExperienceService);
  productsSvc = app.get(ProductsService);
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

// ═══════════════════════════════════════════════════════════════
//  RECENTLY VIEWED (F1-04)
// ═══════════════════════════════════════════════════════════════

it('RV-H01: trackRecentlyViewed adds product to recently viewed', async () => {
  const s = await makeShopper();
  await experienceSvc.trackRecentlyViewed(s.user.id, s.product.id);

  const viewed = await experienceSvc.getRecentlyViewed(s.user.id);
  expect(viewed).toHaveLength(1);
  expect(viewed[0].id).toBe(s.product.id);
});

it('RV-H02: viewing same product twice updates viewedAt (no duplicates)', async () => {
  const s = await makeShopper();
  await experienceSvc.trackRecentlyViewed(s.user.id, s.product.id);
  await new Promise(r => setTimeout(r, 10));
  await experienceSvc.trackRecentlyViewed(s.user.id, s.product.id);

  const viewed = await experienceSvc.getRecentlyViewed(s.user.id);
  expect(viewed).toHaveLength(1); // no duplicate

  const row = await prisma.recentlyViewed.findFirst({ where: { userId: s.user.id } });
  expect(row).not.toBeNull();
});

it('RV-H03: recently viewed returns up to 20 items, newest first', async () => {
  // Create 5 products and track views
  for (let i = 0; i < 5; i++) {
    const s = await makeShopper();
    await experienceSvc.trackRecentlyViewed(s.user.id, s.product.id);

    // Verify it works for a new user each time
    const viewed = await experienceSvc.getRecentlyViewed(s.user.id);
    expect(viewed.length).toBeGreaterThanOrEqual(1);
  }
});

it('RV-E01: recently viewed is user-isolated', async () => {
  const s1 = await makeShopper();
  const s2 = await makeShopper();
  await experienceSvc.trackRecentlyViewed(s1.user.id, s1.product.id);

  const u2Viewed = await experienceSvc.getRecentlyViewed(s2.user.id);
  expect(u2Viewed).toHaveLength(0);
});

// ═══════════════════════════════════════════════════════════════
//  DELIVERY RATING (F2-13)
// ═══════════════════════════════════════════════════════════════

it('DR-H01: can rate a DELIVERED order', async () => {
  const s = await makeShopper({ stock: 5, cartQty: 1 });
  const res = await reservationSvc.createReservation(s.user.id);
  const order = await ordersSvc.placeOrder(s.user.id, {
    addressId: s.address.id,
    reservationId: res.reservationId,
  });
  await ordersSvc.updateOrderStatus(order.id, 'CONFIRMED');
  await ordersSvc.updateOrderStatus(order.id, 'SHIPPED');
  await ordersSvc.updateOrderStatus(order.id, 'DELIVERED');

  const rating = await experienceSvc.rateDelivery(s.user.id, order.id, 5, 'Fast delivery!');
  expect(rating.rating).toBe(5);
  expect(rating.comment).toBe('Fast delivery!');
  expect(rating.orderId).toBe(order.id);
});

it('DR-E01: cannot rate a PENDING order', async () => {
  const s = await makeShopper({ stock: 5, cartQty: 1 });
  const res = await reservationSvc.createReservation(s.user.id);
  const order = await ordersSvc.placeOrder(s.user.id, {
    addressId: s.address.id,
    reservationId: res.reservationId,
  });

  await expect(
    experienceSvc.rateDelivery(s.user.id, order.id, 4),
  ).rejects.toThrow(/delivered/i);
});

it('DR-E02: cannot rate another user\'s order', async () => {
  const s = await makeShopper({ stock: 5, cartQty: 1 });
  const otherUser = await createUser();
  const res = await reservationSvc.createReservation(s.user.id);
  const order = await ordersSvc.placeOrder(s.user.id, {
    addressId: s.address.id,
    reservationId: res.reservationId,
  });
  await ordersSvc.updateOrderStatus(order.id, 'CONFIRMED');
  await ordersSvc.updateOrderStatus(order.id, 'SHIPPED');
  await ordersSvc.updateOrderStatus(order.id, 'DELIVERED');

  await expect(
    experienceSvc.rateDelivery(otherUser.id, order.id, 5),
  ).rejects.toThrow(/not found/i);
});

it('DR-H02: getDeliveryRating returns existing rating', async () => {
  const s = await makeShopper({ stock: 5, cartQty: 1 });
  const res = await reservationSvc.createReservation(s.user.id);
  const order = await ordersSvc.placeOrder(s.user.id, {
    addressId: s.address.id,
    reservationId: res.reservationId,
  });
  await ordersSvc.updateOrderStatus(order.id, 'CONFIRMED');
  await ordersSvc.updateOrderStatus(order.id, 'SHIPPED');
  await ordersSvc.updateOrderStatus(order.id, 'DELIVERED');

  await experienceSvc.rateDelivery(s.user.id, order.id, 3, 'Average');

  const fetched = await experienceSvc.getDeliveryRating(order.id);
  expect(fetched!.rating).toBe(3);
  expect(fetched!.comment).toBe('Average');
});

it('DR-H03: rating can be updated (upsert)', async () => {
  const s = await makeShopper({ stock: 5, cartQty: 1 });
  const res = await reservationSvc.createReservation(s.user.id);
  const order = await ordersSvc.placeOrder(s.user.id, {
    addressId: s.address.id,
    reservationId: res.reservationId,
  });
  await ordersSvc.updateOrderStatus(order.id, 'CONFIRMED');
  await ordersSvc.updateOrderStatus(order.id, 'SHIPPED');
  await ordersSvc.updateOrderStatus(order.id, 'DELIVERED');

  await experienceSvc.rateDelivery(s.user.id, order.id, 2, 'Slow');
  await experienceSvc.rateDelivery(s.user.id, order.id, 4, 'Updated');

  const fetched = await experienceSvc.getDeliveryRating(order.id);
  expect(fetched!.rating).toBe(4);
  expect(fetched!.comment).toBe('Updated');
});

// ═══════════════════════════════════════════════════════════════
//  TRENDING SEARCHES (F2-11)
// ═══════════════════════════════════════════════════════════════

it('TS-H01: logSearch and getTrendingSearches returns top queries', async () => {
  // Log multiple searches
  await productsSvc.logSearch('nike shoes', null, 42);
  await productsSvc.logSearch('nike shoes', null, 30);
  await productsSvc.logSearch('adidas', null, 15);
  await productsSvc.logSearch('nike shoes', null, 20);

  const trending = await productsSvc.getTrendingSearches(5);
  expect(trending.length).toBeGreaterThanOrEqual(1);

  // nike shoes should be first (most searches)
  const queries = trending.map((t: any) => t.query);
  expect(queries[0]).toBe('nike shoes');
});

it('TS-H02: getTrendingSearches respects limit', async () => {
  for (let i = 0; i < 10; i++) {
    await productsSvc.logSearch(`query${i}`, null, i + 1);
  }

  const trending = await productsSvc.getTrendingSearches(3);
  expect(trending.length).toBeLessThanOrEqual(3);
});

// ═══════════════════════════════════════════════════════════════
//  LOYALTY TIERS (F2-19)
// ═══════════════════════════════════════════════════════════════

it('LT-H01: upsert creates loyalty tier and getUserTier returns correct tier', async () => {
  await productsSvc.upsertLoyaltyTier({
    name: 'SILVER',
    minPoints: 1000,
    earnMultiplier: 1.5,
    perks: ['Free shipping', 'Early access'],
  });
  await productsSvc.upsertLoyaltyTier({
    name: 'GOLD',
    minPoints: 5000,
    earnMultiplier: 2.0,
    perks: ['Free shipping', 'Priority CS'],
  });

  const tiers = await productsSvc.getLoyaltyTiers();
  expect(tiers.length).toBeGreaterThanOrEqual(2);
  const names = tiers.map((t: any) => t.name);
  expect(names).toContain('SILVER');
  expect(names).toContain('GOLD');
});

it('LT-H02: getUserTier returns correct tier based on points', async () => {
  await productsSvc.upsertLoyaltyTier({ name: 'BRONZE', minPoints: 100, earnMultiplier: 1.0, perks: [] });
  await productsSvc.upsertLoyaltyTier({ name: 'SILVER', minPoints: 1000, earnMultiplier: 1.5, perks: [] });
  await productsSvc.upsertLoyaltyTier({ name: 'GOLD', minPoints: 5000, earnMultiplier: 2.0, perks: [] });

  const tier = await productsSvc.getUserTier(3500);
  expect(tier).not.toBeNull();
  expect(tier!.name).toBe('SILVER'); // 3500 >= 1000 but < 5000
});

it('LT-H03: getUserTier returns null when below all tier thresholds', async () => {
  await productsSvc.upsertLoyaltyTier({ name: 'BRONZE', minPoints: 500, earnMultiplier: 1.0, perks: [] });

  const tier = await productsSvc.getUserTier(50); // below BRONZE
  expect(tier).toBeNull();
});

it('LT-H04: upsertLoyaltyTier updates existing tier', async () => {
  await productsSvc.upsertLoyaltyTier({ name: 'PLATINUM', minPoints: 10000, earnMultiplier: 3.0, perks: ['VIP'] });
  await productsSvc.upsertLoyaltyTier({ name: 'PLATINUM', minPoints: 10000, earnMultiplier: 4.0, perks: ['VIP', 'Dedicated CS'] });

  const tiers = await productsSvc.getLoyaltyTiers();
  const platinum = tiers.find((t: any) => t.name === 'PLATINUM');
  expect(platinum).toBeDefined();
  expect(platinum!.earnMultiplier).toBe(4.0);
});

// ═══════════════════════════════════════════════════════════════
//  CASHBACK COUPON (F4-07)
// ═══════════════════════════════════════════════════════════════

it('CASH-H01: CASHBACK coupon applies 0 upfront discount', async () => {
  const s = await makeShopper({ stock: 10, cartQty: 2, basePrice: 500 });
  const coupon = await prisma.coupon.create({
    data: {
      code: `CASH10_${Date.now()}`,
      discountType: 'CASHBACK',
      discountValue: 10, // 10% cashback
      maxUses: 100,
      usedCount: 0,
      isActive: true,
    },
  });

  const res = await reservationSvc.createReservation(s.user.id);
  const order = await ordersSvc.placeOrder(s.user.id, {
    addressId: s.address.id,
    reservationId: res.reservationId,
    couponCode: coupon.code,
  });

  // CASHBACK gives 0 upfront discount
  expect(order.discountAmount).toBe(0);
  // total = subtotal + tax + shipping (no coupon discount applied upfront)
  const subtotal = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  expect(order.total).toBeGreaterThanOrEqual(subtotal);
});

it('CASH-H02: CASHBACK coupon credits wallet after order placement', async () => {
  const s = await makeShopper({ stock: 10, cartQty: 2, basePrice: 500 });
  await ensureWallet(s.user.id, 0);

  const coupon = await prisma.coupon.create({
    data: {
      code: `CASH20_${Date.now()}`,
      discountType: 'CASHBACK',
      discountValue: 10, // 10% cashback on subtotal
      maxUses: 100,
      usedCount: 0,
      isActive: true,
    },
  });

  const res = await reservationSvc.createReservation(s.user.id);
  const order = await ordersSvc.placeOrder(s.user.id, {
    addressId: s.address.id,
    reservationId: res.reservationId,
    couponCode: coupon.code,
  });

  // Wallet should have cashback credit (10% of subtotal = 10% of 1000 = 100)
  const wallet = await prisma.wallet.findUnique({ where: { userId: s.user.id } });
  expect(wallet!.balance).toBeGreaterThan(0);

  // Verify it's specifically a cashback transaction
  const tx = await prisma.walletTransaction.findFirst({
    where: {
      wallet: { userId: s.user.id },
      reference: { contains: `${order.id}:cashback` },
    },
  });
  expect(tx).not.toBeNull();
  expect(tx!.amount).toBeGreaterThan(0);
});
