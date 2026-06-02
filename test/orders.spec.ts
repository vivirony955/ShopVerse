// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * Orders Integration Tests
 * Tests: place order, order with coupon, empty cart validation, stock decrement,
 *        stock restore on cancel, get orders, get by id, cancel, return request,
 *        admin status update, admin list all orders, access control.
 */
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import {
  cleanDatabase,
  createUser,
  createAdminUser,
  createCategory,
  createBrand,
  createProduct,
  createVariant,
  createAddress,
  createCoupon,
  seedCart,
  prisma,
} from './helpers/db';
import { loginAs, bearerHeader } from './helpers/auth';

describe('Orders — Integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  // ─── Helper: set up a user with cart ready to order ───────────────────────

  async function setupOrderContext(opts: { stock?: number; quantity?: number } = {}) {
    const stock = opts.stock ?? 10;
    const user = await createUser({ email: `order-${Date.now()}@test.com`, password: 'Password1!' });
    const address = await createAddress(user.id);
    const cat = await createCategory();
    const brand = await createBrand();
    const product = await createProduct(cat.id, brand.id, { basePrice: 1000, discountPct: 0 });
    const variant = await createVariant(product.id, {
      stock,
      sku: `TEST-SKU-${Date.now()}`,
    });

    // Ensure DEFAULT warehouse + WI row so CartReservationService can reserve stock
    const wh = await prisma.warehouse.upsert({
      where: { code: 'DEFAULT' },
      create: { code: 'DEFAULT', name: 'Default Warehouse', pincode: '400001', city: 'Mumbai', state: 'Maharashtra', isActive: true },
      update: {},
    });
    await prisma.warehouseInventory.upsert({
      where: { warehouseId_variantId: { warehouseId: wh.id, variantId: variant.id } },
      create: { warehouseId: wh.id, variantId: variant.id, stock, reserved: 0 },
      update: { stock, reserved: 0 },
    });

    await seedCart(user.id, variant.id, opts.quantity ?? 2);
    const { access_token } = await loginAs(app, user.email, 'Password1!');

    // Helper to create a fresh reservation (consumed after each use)
    async function getReservation(): Promise<number> {
      const res = await request(app.getHttpServer())
        .post('/api/cart/reserve')
        .set('Authorization', bearerHeader(access_token))
        .expect(201);
      return res.body.reservationId;
    }

    return { user, address, product, variant, access_token, getReservation };
  }

  // ─── POST /api/orders (place order) ───────────────────────────────────────

  describe('POST /api/orders', () => {
    it('places an order from cart, clears cart, decrements stock', async () => {
      const { address, variant, access_token, getReservation } = await setupOrderContext({ stock: 10, quantity: 2 });
      const reservationId = await getReservation();

      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearerHeader(access_token))
        .send({ addressId: address.id, reservationId })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('PENDING');
      expect(res.body.items).toHaveLength(1);
      expect(res.body.total).toBeGreaterThan(0);

      // Cart should be empty
      const cartRes = await request(app.getHttpServer())
        .get('/api/cart')
        .set('Authorization', bearerHeader(access_token));
      expect(cartRes.body.items).toHaveLength(0);

      // In the reservation model, stock is NOT decremented on PENDING — it's
      // reserved (reservedStock += qty). Stock decrements only on SHIPPED.
      const updatedVariant = await prisma.variant.findUnique({ where: { id: variant.id } });
      expect(updatedVariant!.reservedStock).toBe(2); // reserved
      expect(updatedVariant!.stock).toBe(10); // stock unchanged until SHIPPED
    });

    it('applies percentage coupon discount correctly', async () => {
      const { address, access_token, getReservation } = await setupOrderContext({ stock: 10, quantity: 1 });
      const coupon = await createCoupon({
        code: `SAVE10_${Date.now()}`,
        discountType: 'PERCENTAGE',
        discountValue: 10,
        minOrderAmount: 0,
      });
      const reservationId = await getReservation();

      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearerHeader(access_token))
        .send({ addressId: address.id, reservationId, couponCode: coupon.code })
        .expect(201);

      // 1000 base, 10% off = 100 discount; total includes 18% GST
      expect(res.body.discountAmount).toBeCloseTo(100);
      expect(res.body.total).toBeGreaterThan(res.body.subtotal - res.body.discountAmount);
      expect(res.body.couponCode).toBe(coupon.code);

      // Coupon usedCount incremented
      const updatedCoupon = await prisma.coupon.findUnique({ where: { id: coupon.id } });
      expect(updatedCoupon!.usedCount).toBe(1);
    });

    it('applies fixed coupon discount correctly', async () => {
      const { address, access_token, getReservation } = await setupOrderContext({ stock: 10, quantity: 1 });
      const coupon = await createCoupon({
        code: `FLAT200_${Date.now()}`,
        discountType: 'FIXED',
        discountValue: 200,
        minOrderAmount: 0,
      });
      const reservationId = await getReservation();

      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearerHeader(access_token))
        .send({ addressId: address.id, reservationId, couponCode: coupon.code })
        .expect(201);

      expect(res.body.discountAmount).toBeCloseTo(200);
      // total = (1000 - 200) + 18% GST = 944
      expect(res.body.total).toBeGreaterThan(700);
    });

    it('returns 400 when cart is empty', async () => {
      const user = await createUser({ email: `empty-cart-${Date.now()}@test.com`, password: 'Password1!' });
      const address = await createAddress(user.id);
      const { access_token } = await loginAs(app, user.email, 'Password1!');

      await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearerHeader(access_token))
        .send({ addressId: address.id })
        .expect(400);
    });

    it('returns 404 for address that does not belong to user', async () => {
      const { access_token, getReservation } = await setupOrderContext();
      const otherUser = await createUser({ email: `other-${Date.now()}@test.com`, password: 'Password1!' });
      const otherAddress = await createAddress(otherUser.id);
      const reservationId = await getReservation();

      await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearerHeader(access_token))
        .send({ addressId: otherAddress.id, reservationId })
        .expect(404);
    });

    it('returns 400 when stock is insufficient', async () => {
      const { address, access_token } = await setupOrderContext({ stock: 1, quantity: 2 });

      // Drain the stock directly so cart has more than what's available
      // (simulating concurrent purchase between adding to cart and placing order)
      // We set up cart with qty=2 but stock=1 after cart creation
      // Cart already has qty=2 which was validated at add time... so we need to
      // manipulate stock after the fact
      const user2 = await createUser({ email: `stock2-${Date.now()}@test.com`, password: 'Password1!' });
      const addr2 = await createAddress(user2.id);
      const { access_token: t2 } = await loginAs(app, user2.email, 'Password1!');

      // Note: stock was 1 at setup, cart item qty is 2 — reservation will fail (insufficient stock)
      await request(app.getHttpServer())
        .post('/api/cart/reserve')
        .set('Authorization', bearerHeader(access_token))
        .expect(400);
    });

    it('returns 404 for invalid coupon code', async () => {
      const { address, access_token, getReservation } = await setupOrderContext();
      const reservationId = await getReservation();

      await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearerHeader(access_token))
        .send({ addressId: address.id, reservationId, couponCode: 'NOSUCHCOUPON' })
        .expect(404);
    });

    it('returns 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/orders')
        .send({ addressId: 1 })
        .expect(401);
    });

    it('snapshots address so future address changes do not affect order history', async () => {
      const { address, access_token, user, getReservation } = await setupOrderContext();
      const reservationId = await getReservation();

      const orderRes = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearerHeader(access_token))
        .send({ addressId: address.id, reservationId })
        .expect(201);

      const snapshot = orderRes.body.addressSnapshot;
      expect(snapshot.city).toBe('Mumbai');

      // Update address
      const { access_token: token } = await loginAs(app, user.email, 'Password1!');
      await request(app.getHttpServer())
        .patch(`/api/users/me/addresses/${address.id}`)
        .set('Authorization', bearerHeader(token))
        .send({ city: 'Bangalore' });

      // Order snapshot should still have original city
      const orderGet = await request(app.getHttpServer())
        .get(`/api/orders/${orderRes.body.id}`)
        .set('Authorization', bearerHeader(access_token));

      expect(orderGet.body.addressSnapshot.city).toBe('Mumbai');
    });
  });

  // ─── GET /api/orders ───────────────────────────────────────────────────────

  describe('GET /api/orders', () => {
    it('returns user\'s orders in descending createdAt order', async () => {
      const { address, access_token, getReservation } = await setupOrderContext();
      const reservationId = await getReservation();

      await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearerHeader(access_token))
        .send({ addressId: address.id, reservationId });

      const res = await request(app.getHttpServer())
        .get('/api/orders')
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].items).toBeDefined();
    });

    it('returns empty array when user has no orders', async () => {
      await createUser({ email: 'noorders@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'noorders@test.com', 'Password1!');

      const res = await request(app.getHttpServer())
        .get('/api/orders')
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('user cannot see other users\' orders', async () => {
      const { address, access_token: t1, getReservation } = await setupOrderContext();
      await createUser({ email: 'spy@test.com', password: 'Password1!' });
      const { access_token: t2 } = await loginAs(app, 'spy@test.com', 'Password1!');
      const reservationId = await getReservation();

      await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearerHeader(t1))
        .send({ addressId: address.id, reservationId });

      const res = await request(app.getHttpServer())
        .get('/api/orders')
        .set('Authorization', bearerHeader(t2))
        .expect(200);

      expect(res.body).toHaveLength(0);
    });
  });

  // ─── GET /api/orders/:id ───────────────────────────────────────────────────

  describe('GET /api/orders/:id', () => {
    it('returns order details for owner', async () => {
      const { address, access_token, getReservation } = await setupOrderContext();
      const reservationId = await getReservation();

      const orderRes = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearerHeader(access_token))
        .send({ addressId: address.id, reservationId });

      const res = await request(app.getHttpServer())
        .get(`/api/orders/${orderRes.body.id}`)
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      expect(res.body.id).toBe(orderRes.body.id);
      expect(res.body.items).toBeDefined();
    });

    it('returns 403 when user accesses another user\'s order', async () => {
      const { address, access_token: t1, getReservation } = await setupOrderContext();
      await createUser({ email: 'spy2@test.com', password: 'Password1!' });
      const { access_token: t2 } = await loginAs(app, 'spy2@test.com', 'Password1!');
      const reservationId = await getReservation();

      const orderRes = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearerHeader(t1))
        .send({ addressId: address.id, reservationId });

      await request(app.getHttpServer())
        .get(`/api/orders/${orderRes.body.id}`)
        .set('Authorization', bearerHeader(t2))
        .expect(403);
    });

    it('returns 404 for non-existent order', async () => {
      await createUser({ email: 'notfound@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'notfound@test.com', 'Password1!');

      await request(app.getHttpServer())
        .get('/api/orders/99999')
        .set('Authorization', bearerHeader(access_token))
        .expect(404);
    });
  });

  // ─── PATCH /api/orders/:id/cancel ─────────────────────────────────────────

  describe('PATCH /api/orders/:id/cancel', () => {
    it('cancels a PENDING order and restores stock', async () => {
      const { address, variant, access_token, getReservation } = await setupOrderContext({ stock: 10, quantity: 3 });
      const reservationId = await getReservation();

      const orderRes = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearerHeader(access_token))
        .send({ addressId: address.id, reservationId });

      // PENDING: stock is reserved (reservedStock=3), not decremented (stock=10)
      const stockAfterOrder = await prisma.variant.findUnique({ where: { id: variant.id } });
      expect(stockAfterOrder!.reservedStock).toBe(3);
      expect(stockAfterOrder!.stock).toBe(10);

      await request(app.getHttpServer())
        .patch(`/api/orders/${orderRes.body.id}/cancel`)
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      // Cancel releases the reservation: reservedStock=0, stock unchanged
      const stockAfterCancel = await prisma.variant.findUnique({ where: { id: variant.id } });
      expect(stockAfterCancel!.reservedStock).toBe(0);
      expect(stockAfterCancel!.stock).toBe(10);
    });

    it('returns 400 when trying to cancel a SHIPPED order', async () => {
      const { address, access_token, getReservation } = await setupOrderContext();
      const reservationId = await getReservation();
      const orderRes = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearerHeader(access_token))
        .send({ addressId: address.id, reservationId });

      // Admin moves order to SHIPPED
      await createAdminUser({ email: `admin-cancel-${Date.now()}@test.com`, password: 'Admin@123' });
      const adminEmails = await prisma.user.findMany({ where: { role: 'ADMIN' } });
      const admin = adminEmails[adminEmails.length - 1];
      const { access_token: adminToken } = await loginAs(app, admin.email, 'Admin@123');

      await request(app.getHttpServer())
        .patch(`/api/orders/admin/${orderRes.body.id}/status`)
        .set('Authorization', bearerHeader(adminToken))
        .send({ status: 'SHIPPED' });

      await request(app.getHttpServer())
        .patch(`/api/orders/${orderRes.body.id}/cancel`)
        .set('Authorization', bearerHeader(access_token))
        .expect(400);
    });

    it('returns 404 for non-existent order', async () => {
      await createUser({ email: 'cancelnotfound@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'cancelnotfound@test.com', 'Password1!');

      await request(app.getHttpServer())
        .patch('/api/orders/99999/cancel')
        .set('Authorization', bearerHeader(access_token))
        .expect(404);
    });
  });

  // ─── PATCH /api/orders/:id/return ─────────────────────────────────────────

  describe('PATCH /api/orders/:id/return', () => {
    it('requests return for a DELIVERED order', async () => {
      const { address, access_token, getReservation } = await setupOrderContext();
      const reservationId = await getReservation();
      const orderRes = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearerHeader(access_token))
        .send({ addressId: address.id, reservationId });

      // Admin marks as DELIVERED
      await createAdminUser({ email: `admin-return-${Date.now()}@test.com`, password: 'Admin@123' });
      const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
      const admin = admins[admins.length - 1];
      const { access_token: adminToken } = await loginAs(app, admin.email, 'Admin@123');

      await request(app.getHttpServer())
        .patch(`/api/orders/admin/${orderRes.body.id}/status`)
        .set('Authorization', bearerHeader(adminToken))
        .send({ status: 'DELIVERED' });

      const returnRes = await request(app.getHttpServer())
        .patch(`/api/orders/${orderRes.body.id}/return`)
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      // The endpoint returns the ReturnRequest row (status='REQUESTED'),
      // while the Order's status transitions to 'RETURN_REQUESTED'.
      expect(returnRes.body.status).toBe('REQUESTED');
    });

    it('returns 400 when order is not DELIVERED', async () => {
      const { address, access_token, getReservation } = await setupOrderContext();
      const reservationId = await getReservation();
      const orderRes = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearerHeader(access_token))
        .send({ addressId: address.id, reservationId });

      // Still PENDING
      await request(app.getHttpServer())
        .patch(`/api/orders/${orderRes.body.id}/return`)
        .set('Authorization', bearerHeader(access_token))
        .expect(400);
    });
  });

  // ─── Admin: GET /api/orders/admin/all ─────────────────────────────────────

  describe('GET /api/orders/admin/all (admin only)', () => {
    it('admin can list all orders', async () => {
      const { address, access_token: userToken, getReservation } = await setupOrderContext();
      const reservationId = await getReservation();
      await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearerHeader(userToken))
        .send({ addressId: address.id, reservationId });

      await createAdminUser({ email: `admin-list-${Date.now()}@test.com`, password: 'Admin@123' });
      const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
      const admin = admins[admins.length - 1];
      const { access_token: adminToken } = await loginAs(app, admin.email, 'Admin@123');

      const res = await request(app.getHttpServer())
        .get('/api/orders/admin/all')
        .set('Authorization', bearerHeader(adminToken))
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('returns 403 for regular user', async () => {
      await createUser({ email: 'notadminlist@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'notadminlist@test.com', 'Password1!');

      await request(app.getHttpServer())
        .get('/api/orders/admin/all')
        .set('Authorization', bearerHeader(access_token))
        .expect(403);
    });
  });

  // ─── Admin: PATCH /api/orders/admin/:id/status ────────────────────────────

  describe('PATCH /api/orders/admin/:id/status (admin only)', () => {
    it('admin updates order status', async () => {
      const { address, access_token: userToken, getReservation } = await setupOrderContext();
      const reservationId = await getReservation();
      const orderRes = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearerHeader(userToken))
        .send({ addressId: address.id, reservationId });

      await createAdminUser({ email: `admin-status-${Date.now()}@test.com`, password: 'Admin@123' });
      const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
      const admin = admins[admins.length - 1];
      const { access_token: adminToken } = await loginAs(app, admin.email, 'Admin@123');

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/orders/admin/${orderRes.body.id}/status`)
        .set('Authorization', bearerHeader(adminToken))
        .send({ status: 'CONFIRMED' })
        .expect(200);

      expect(updateRes.body.status).toBe('CONFIRMED');
    });

    it('returns 403 for non-admin', async () => {
      const { address, access_token, getReservation } = await setupOrderContext();
      const reservationId = await getReservation();
      const orderRes = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearerHeader(access_token))
        .send({ addressId: address.id, reservationId });

      await request(app.getHttpServer())
        .patch(`/api/orders/admin/${orderRes.body.id}/status`)
        .set('Authorization', bearerHeader(access_token))
        .send({ status: 'CONFIRMED' })
        .expect(403);
    });
  });
});
