// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * C-02 — Admin RBAC Integration Tests
 *
 * Verifies that:
 *  1. Every admin-only endpoint returns 403 when called with a regular-user JWT.
 *  2. Every admin-only endpoint returns 2xx when called with an admin JWT.
 *  3. Missing/no token returns 401.
 *
 * Routes tested (from orders.controller + wallet.controller):
 *   GET  /api/orders/admin/all            — list all orders
 *   PATCH /api/orders/admin/:id/status    — advance order status
 *   PATCH /api/orders/admin/:id/items/:itemId/refund — item refund
 *   POST  /api/wallet/credit              — admin wallet credit
 *   POST  /api/wallet/debit               — admin wallet debit
 *   GET   /api/wallet/ledger              — ledger report
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
  seedCart,
  prisma,
} from './helpers/db';
import { loginAs, bearerHeader } from './helpers/auth';
import { ensureDefaultWarehouse } from './helpers/factories';

let app: INestApplication;

beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await closeTestApp(); });
beforeEach(async () => { await cleanDatabase(); });

// ─── Helper: create a placed order for route param tests ─────────────────────

async function createPlacedOrder(adminToken: string) {
  const warehouseId = await ensureDefaultWarehouse();
  const u = await createUser({ email: `rbac-buyer-${Date.now()}@test.com`, password: 'Test@1234' });
  const addr = await createAddress(u.id);
  const cat = await createCategory();
  const brand = await createBrand();
  const product = await createProduct(cat.id, brand.id, { basePrice: 500 });
  const variant = await createVariant(product.id, { stock: 20 });
  await prisma.warehouseInventory.upsert({
    where: { warehouseId_variantId: { warehouseId, variantId: variant.id } },
    update: { stock: 20 },
    create: { warehouseId, variantId: variant.id, stock: 20, reserved: 0 },
  });
  await seedCart(u.id, variant.id, 1);
  const { access_token: buyerToken } = await loginAs(app, u.email, 'Test@1234');

  // Reserve
  const resRes = await request(app.getHttpServer())
    .post('/api/cart/reserve')
    .set('Authorization', bearerHeader(buyerToken))
    .expect(201);
  const reservationId = resRes.body.reservationId;

  // Place
  const orderRes = await request(app.getHttpServer())
    .post('/api/orders')
    .set('Authorization', bearerHeader(buyerToken))
    .send({ addressId: addr.id, reservationId })
    .expect(201);

  return orderRes.body;
}

// ════════════════════════════════════════════════════════════════════════
//  1. Unauthenticated → 401
// ════════════════════════════════════════════════════════════════════════

describe('Admin RBAC — 401 without token', () => {
  it('GET /api/orders/admin/all → 401 without token', async () => {
    await request(app.getHttpServer())
      .get('/api/orders/admin/all')
      .expect(401);
  });

  it('PATCH /api/orders/admin/1/status → 401 without token', async () => {
    await request(app.getHttpServer())
      .patch('/api/orders/admin/1/status')
      .send({ status: 'CONFIRMED' })
      .expect(401);
  });

  it('POST /api/wallet/credit → 401 without token', async () => {
    await request(app.getHttpServer())
      .post('/api/wallet/credit')
      .send({ userId: 1, amount: 100, reference: 'admin:credit:test:20260427' })
      .expect(401);
  });
});

// ════════════════════════════════════════════════════════════════════════
//  2. Regular-user JWT → 403 on all admin routes
// ════════════════════════════════════════════════════════════════════════

describe('Admin RBAC — 403 with regular user token', () => {
  let userToken: string;

  beforeEach(async () => {
    const user = await createUser({ email: `rbac-user-${Date.now()}@test.com`, password: 'Test@1234' });
    const tokens = await loginAs(app, user.email, 'Test@1234');
    userToken = tokens.access_token;
  });

  it('GET /api/orders/admin/all → 403 for regular user', async () => {
    await request(app.getHttpServer())
      .get('/api/orders/admin/all')
      .set('Authorization', bearerHeader(userToken))
      .expect(403);
  });

  it('PATCH /api/orders/admin/999/status → 403 for regular user', async () => {
    await request(app.getHttpServer())
      .patch('/api/orders/admin/999/status')
      .set('Authorization', bearerHeader(userToken))
      .send({ status: 'CONFIRMED' })
      .expect(403);
  });

  it('PATCH /api/orders/admin/999/items/1/refund → 403 for regular user', async () => {
    await request(app.getHttpServer())
      .patch('/api/orders/admin/999/items/1/refund')
      .set('Authorization', bearerHeader(userToken))
      .send({})
      .expect(403);
  });

  it('POST /api/wallet/credit → 403 for regular user', async () => {
    await request(app.getHttpServer())
      .post('/api/wallet/credit')
      .set('Authorization', bearerHeader(userToken))
      .send({ userId: 1, amount: 100, reference: 'admin:credit:test:20260427' })
      .expect(403);
  });

  it('POST /api/wallet/debit → 403 for regular user', async () => {
    await request(app.getHttpServer())
      .post('/api/wallet/debit')
      .set('Authorization', bearerHeader(userToken))
      .send({ userId: 1, amount: 50 })
      .expect(403);
  });

  it('GET /api/wallet/ledger → 403 for regular user', async () => {
    await request(app.getHttpServer())
      .get('/api/wallet/ledger?from=2026-01-01&to=2026-12-31')
      .set('Authorization', bearerHeader(userToken))
      .expect(403);
  });
});

// ════════════════════════════════════════════════════════════════════════
//  3. Admin JWT → 2xx on admin routes
// ════════════════════════════════════════════════════════════════════════

describe('Admin RBAC — 2xx with admin token', () => {
  let adminToken: string;
  let adminUser: { id: number; email: string };

  beforeEach(async () => {
    const admin = await createAdminUser({ email: `rbac-admin-${Date.now()}@test.com`, password: 'Admin@1234' });
    adminUser = admin;
    const tokens = await loginAs(app, admin.email, 'Admin@1234');
    adminToken = tokens.access_token;
  });

  it('GET /api/orders/admin/all → 200 for admin', async () => {
    await request(app.getHttpServer())
      .get('/api/orders/admin/all')
      .set('Authorization', bearerHeader(adminToken))
      .expect(200);
  });

  it('PATCH /api/orders/admin/:id/status → 200 for admin', async () => {
    const order = await createPlacedOrder(adminToken);
    const res = await request(app.getHttpServer())
      .patch(`/api/orders/admin/${order.id}/status`)
      .set('Authorization', bearerHeader(adminToken))
      .send({ status: 'CONFIRMED' })
      .expect(200);
    expect(res.body.status).toBe('CONFIRMED');
  });

  it('POST /api/wallet/credit → 200 for admin (idempotent reference)', async () => {
    const targetUser = await createUser({ email: `rbac-target-${Date.now()}@test.com` });
    await request(app.getHttpServer())
      .post('/api/wallet/credit')
      .set('Authorization', bearerHeader(adminToken))
      .send({
        userId: targetUser.id,
        amount: 250,
        reference: `admin:credit:test:${Date.now()}`,
        description: 'Admin goodwill credit',
      })
      .expect(201);

    const wallet = await prisma.wallet.findUnique({ where: { userId: targetUser.id } });
    expect(wallet?.balance).toBe(250);
  });

  it('POST /api/wallet/credit → 400 if reference missing (guard against anonymous auto-credits)', async () => {
    const targetUser = await createUser({ email: `rbac-noref-${Date.now()}@test.com` });
    await request(app.getHttpServer())
      .post('/api/wallet/credit')
      .set('Authorization', bearerHeader(adminToken))
      .send({ userId: targetUser.id, amount: 100 }) // no reference
      .expect(400);
  });

  it('GET /api/wallet/ledger → 200 for admin', async () => {
    await request(app.getHttpServer())
      .get('/api/wallet/ledger?from=2026-01-01&to=2026-12-31')
      .set('Authorization', bearerHeader(adminToken))
      .expect(200);
  });
});

// ════════════════════════════════════════════════════════════════════════
//  4. Admin item-level refund RBAC + functional check
// ════════════════════════════════════════════════════════════════════════

describe('Admin RBAC — item-level refund gate', () => {
  it('PATCH /api/orders/admin/:id/items/:itemId/refund → 200 for admin + wallet credited', async () => {
    const admin = await createAdminUser({ email: `rbac-ref-admin-${Date.now()}@test.com`, password: 'Admin@1234' });
    const { access_token: adminToken } = await loginAs(app, admin.email, 'Admin@1234');

    const order = await createPlacedOrder(adminToken);
    const item = order.items[0];

    // Confirm order so it can be refunded
    await request(app.getHttpServer())
      .patch(`/api/orders/admin/${order.id}/status`)
      .set('Authorization', bearerHeader(adminToken))
      .send({ status: 'CONFIRMED' })
      .expect(200);

    const refundRes = await request(app.getHttpServer())
      .patch(`/api/orders/admin/${order.id}/items/${item.id}/refund`)
      .set('Authorization', bearerHeader(adminToken))
      .send({})
      .expect(200);

    // refundOrderItem returns { refunded: true, refundAmount, nextStatus } or { message, refundedAt }
    expect(refundRes.body.refunded === true || refundRes.body.message != null).toBe(true);

    // Buyer's wallet should have been credited
    const wallet = await prisma.wallet.findUnique({ where: { userId: order.userId } });
    expect(wallet?.balance).toBeGreaterThan(0);
  });

  it('PATCH /api/orders/admin/:id/items/:itemId/refund → 403 for regular user', async () => {
    const admin = await createAdminUser({ email: `rbac-ref-admin2-${Date.now()}@test.com`, password: 'Admin@1234' });
    const { access_token: adminToken } = await loginAs(app, admin.email, 'Admin@1234');
    const order = await createPlacedOrder(adminToken);
    const item = order.items[0];

    const normalUser = await createUser({ email: `rbac-norm-${Date.now()}@test.com`, password: 'Test@1234' });
    const { access_token: userToken } = await loginAs(app, normalUser.email, 'Test@1234');

    await request(app.getHttpServer())
      .patch(`/api/orders/admin/${order.id}/items/${item.id}/refund`)
      .set('Authorization', bearerHeader(userToken))
      .send({})
      .expect(403);
  });
});
