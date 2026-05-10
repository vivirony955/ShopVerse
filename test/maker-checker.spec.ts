// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * S-12 (partial) / ADM-H03-H03b / ADM-E01-E05 — Maker-Checker & Role RBAC
 *
 * Covers the high-value refund approval flow (maker-checker pattern):
 *   ADM-H03   CS_AGENT requests ₹10k → FINANCE approves → wallet credited + approval EXECUTED
 *   ADM-H03b  CS_AGENT requests → FINANCE rejects → approval REJECTED
 *   ADM-E01   Amount ≤ ₹5000 → BadRequestException (threshold boundary, below)
 *   ADM-E01b  Amount = ₹5001 → created (threshold boundary, above)
 *   ADM-E05   Self-approval → ForbiddenException (T-AD01)
 *   ADM-E05b  Self-rejection → ForbiddenException
 *   ADM-E08   Double-approve (EXECUTED → approve again) → BadRequestException
 *   Role gates on all 4 maker-checker endpoints
 *   ADM-H01 gap: CS_AGENT cannot GET /api/orders/admin/all (ADMIN-only; Phase-2 TODO)
 *
 * Routes under test (AdminController — /api/admin/...):
 *   POST   /api/admin/refund-approvals           — CS_AGENT, ADMIN, SUPER_ADMIN
 *   GET    /api/admin/refund-approvals/pending    — FINANCE, ADMIN, SUPER_ADMIN
 *   PATCH  /api/admin/refund-approvals/:id/approve — FINANCE, ADMIN, SUPER_ADMIN
 *   PATCH  /api/admin/refund-approvals/:id/reject  — FINANCE, ADMIN, SUPER_ADMIN
 */
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  cleanDatabase,
  createUser,
  createAdminUser,
  createUserByRole,
  createCategory,
  createBrand,
  createProduct,
  createVariant,
  createAddress,
  seedCart,
  prisma,
} from './helpers/db';
import { getTestApp, closeTestApp } from './helpers/app';
import { loginAs, bearerHeader } from './helpers/auth';
import { ensureDefaultWarehouse } from './helpers/factories';

let app: INestApplication;

beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await closeTestApp(); });
beforeEach(async () => { await cleanDatabase(); });

// ─── Setup helpers ───────────────────────────────────────────────────────────

/** Create a real placed order for a buyer user. Returns order + buyerToken. */
async function createPlacedOrder(): Promise<{
  orderId: number;
  buyerUserId: number;
  buyerToken: string;
}> {
  const warehouseId = await ensureDefaultWarehouse();
  const cat = await createCategory();
  const brand = await createBrand();
  // ₹10 000 product so refund amount fits comfortably within order total
  const product = await createProduct(cat.id, brand.id, { basePrice: 10000 });
  const variant = await createVariant(product.id, { stock: 20 });
  await prisma.warehouseInventory.upsert({
    where: { warehouseId_variantId: { warehouseId, variantId: variant.id } },
    update: { stock: 20 },
    create: { warehouseId, variantId: variant.id, stock: 20, reserved: 0 },
  });
  const buyer = await createUser({ email: `mc-buyer-${Date.now()}@test.com`, password: 'Test@1234' });
  const addr = await createAddress(buyer.id);
  await prisma.wallet.upsert({
    where: { userId: buyer.id },
    update: {},
    create: { userId: buyer.id, balance: 0 },
  });
  await seedCart(buyer.id, variant.id, 1);
  const { access_token: buyerToken } = await loginAs(app, buyer.email, 'Test@1234');

  const resRes = await request(app.getHttpServer())
    .post('/api/cart/reserve')
    .set('Authorization', bearerHeader(buyerToken))
    .expect(201);

  const orderRes = await request(app.getHttpServer())
    .post('/api/orders')
    .set('Authorization', bearerHeader(buyerToken))
    .send({ addressId: addr.id, reservationId: resRes.body.reservationId })
    .expect(201);

  return { orderId: orderRes.body.id, buyerUserId: buyer.id, buyerToken };
}

// ════════════════════════════════════════════════════════════════════════
//  1. Role gates — POST /api/admin/refund-approvals
//     Allowed: ADMIN, CS_AGENT, SUPER_ADMIN
//     Blocked: no token (401), USER (403), FINANCE (403)
// ════════════════════════════════════════════════════════════════════════

describe('Maker-Checker RBAC — POST /api/admin/refund-approvals', () => {
  it('no token → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/refund-approvals')
      .send({ orderId: 1, amount: 6000, reason: 'test' })
      .expect(401);
  });

  it('regular USER → 403', async () => {
    const user = await createUser({ email: `mc-user-${Date.now()}@test.com`, password: 'Test@1234' });
    const { access_token } = await loginAs(app, user.email, 'Test@1234');
    await request(app.getHttpServer())
      .post('/api/admin/refund-approvals')
      .set('Authorization', bearerHeader(access_token))
      .send({ orderId: 1, amount: 6000, reason: 'test' })
      .expect(403);
  });

  it('FINANCE role → 403 (not permitted to request; only to approve)', async () => {
    const { orderId } = await createPlacedOrder();
    const fin = await createUserByRole('FINANCE', { email: `mc-fin-gate-${Date.now()}@test.com` });
    const { access_token } = await loginAs(app, fin.email, 'Test@1234');
    await request(app.getHttpServer())
      .post('/api/admin/refund-approvals')
      .set('Authorization', bearerHeader(access_token))
      .send({ orderId, amount: 6000, reason: 'test' })
      .expect(403);
  });

  it('CS_AGENT → 201 (role is permitted to request)', async () => {
    const { orderId } = await createPlacedOrder();
    const cs = await createUserByRole('CS_AGENT', { email: `mc-cs-gate-${Date.now()}@test.com` });
    const { access_token } = await loginAs(app, cs.email, 'Test@1234');
    const res = await request(app.getHttpServer())
      .post('/api/admin/refund-approvals')
      .set('Authorization', bearerHeader(access_token))
      .send({ orderId, amount: 6000, reason: 'Legitimate high-value refund' })
      .expect(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.amount).toBe(6000);
  });
});

// ════════════════════════════════════════════════════════════════════════
//  2. Role gates — GET /api/admin/refund-approvals/pending
//     Allowed: ADMIN, FINANCE, SUPER_ADMIN
//     Blocked: no token (401), USER (403), CS_AGENT (403)
// ════════════════════════════════════════════════════════════════════════

describe('Maker-Checker RBAC — GET /api/admin/refund-approvals/pending', () => {
  it('no token → 401', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/refund-approvals/pending')
      .expect(401);
  });

  it('regular USER → 403', async () => {
    const user = await createUser({ email: `mc-user2-${Date.now()}@test.com`, password: 'Test@1234' });
    const { access_token } = await loginAs(app, user.email, 'Test@1234');
    await request(app.getHttpServer())
      .get('/api/admin/refund-approvals/pending')
      .set('Authorization', bearerHeader(access_token))
      .expect(403);
  });

  it('CS_AGENT → 403 (cannot view pending approvals)', async () => {
    const cs = await createUserByRole('CS_AGENT', { email: `mc-cs2-${Date.now()}@test.com` });
    const { access_token } = await loginAs(app, cs.email, 'Test@1234');
    await request(app.getHttpServer())
      .get('/api/admin/refund-approvals/pending')
      .set('Authorization', bearerHeader(access_token))
      .expect(403);
  });

  it('FINANCE → 200 (can view pending approvals)', async () => {
    const fin = await createUserByRole('FINANCE', { email: `mc-fin2-${Date.now()}@test.com` });
    const { access_token } = await loginAs(app, fin.email, 'Test@1234');
    const res = await request(app.getHttpServer())
      .get('/api/admin/refund-approvals/pending')
      .set('Authorization', bearerHeader(access_token))
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════
//  3. Role gates — PATCH /api/admin/refund-approvals/:id/approve
//     Allowed: ADMIN, FINANCE, SUPER_ADMIN
//     Blocked: CS_AGENT (403)
// ════════════════════════════════════════════════════════════════════════

describe('Maker-Checker RBAC — PATCH approve/reject role gates', () => {
  it('CS_AGENT cannot approve → 403', async () => {
    await request(app.getHttpServer())
      .patch('/api/admin/refund-approvals/999/approve')
      .set('Authorization', bearerHeader(
        (await loginAs(app,
          (await createUserByRole('CS_AGENT', { email: `mc-cs3-${Date.now()}@test.com` })).email,
          'Test@1234',
        )).access_token,
      ))
      .expect(403);
  });

  it('CS_AGENT cannot reject → 403', async () => {
    await request(app.getHttpServer())
      .patch('/api/admin/refund-approvals/999/reject')
      .set('Authorization', bearerHeader(
        (await loginAs(app,
          (await createUserByRole('CS_AGENT', { email: `mc-cs4-${Date.now()}@test.com` })).email,
          'Test@1234',
        )).access_token,
      ))
      .send({ reason: 'test' })
      .expect(403);
  });
});

// ════════════════════════════════════════════════════════════════════════
//  4. ADM-E01 / ADM-E01b — Threshold boundary
//     HIGH_VALUE_THRESHOLD = ₹5000
//     ≤ 5000 → BadRequestException; 5001 → accepted
// ════════════════════════════════════════════════════════════════════════

describe('ADM-E01 / ADM-E01b — ₹5000 threshold boundary', () => {
  it('ADM-E01: amount = 5000 (exactly at threshold) → 400 BadRequest', async () => {
    const { orderId } = await createPlacedOrder();
    const admin = await createAdminUser({ email: `mc-adm-e01-${Date.now()}@test.com`, password: 'Admin@1234' });
    const { access_token } = await loginAs(app, admin.email, 'Admin@1234');
    await request(app.getHttpServer())
      .post('/api/admin/refund-approvals')
      .set('Authorization', bearerHeader(access_token))
      .send({ orderId, amount: 5000, reason: 'boundary test' })
      .expect(400);
  });

  it('ADM-E01b: amount = 5001 (just above threshold) → 201 PENDING', async () => {
    const { orderId } = await createPlacedOrder();
    const admin = await createAdminUser({ email: `mc-adm-e01b-${Date.now()}@test.com`, password: 'Admin@1234' });
    const { access_token } = await loginAs(app, admin.email, 'Admin@1234');
    const res = await request(app.getHttpServer())
      .post('/api/admin/refund-approvals')
      .set('Authorization', bearerHeader(access_token))
      .send({ orderId, amount: 5001, reason: 'boundary test above' })
      .expect(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.amount).toBe(5001);
  });
});

// ════════════════════════════════════════════════════════════════════════
//  5. ADM-H03 — Full maker-checker happy path
//     CS_AGENT requests ₹10k → FINANCE approves → wallet credited + EXECUTED
// ════════════════════════════════════════════════════════════════════════

it('ADM-H03: maker-checker full flow — CS_AGENT requests → FINANCE approves → wallet credited', async () => {
  const { orderId, buyerUserId } = await createPlacedOrder();

  // CS_AGENT creates the refund request
  const cs = await createUserByRole('CS_AGENT', { email: `mc-cs-h03-${Date.now()}@test.com` });
  const { access_token: csToken } = await loginAs(app, cs.email, 'Test@1234');
  const reqRes = await request(app.getHttpServer())
    .post('/api/admin/refund-approvals')
    .set('Authorization', bearerHeader(csToken))
    .send({ orderId, amount: 10000, reason: 'Customer damage claim' })
    .expect(201);
  const approvalId = reqRes.body.id;
  expect(reqRes.body.status).toBe('PENDING');
  expect(reqRes.body.requestedBy).toBe(cs.id);

  // FINANCE lists pending approvals — sees the request
  const fin = await createUserByRole('FINANCE', { email: `mc-fin-h03-${Date.now()}@test.com` });
  const { access_token: finToken } = await loginAs(app, fin.email, 'Test@1234');
  const pendingRes = await request(app.getHttpServer())
    .get('/api/admin/refund-approvals/pending')
    .set('Authorization', bearerHeader(finToken))
    .expect(200);
  expect(pendingRes.body.some((a: any) => a.id === approvalId)).toBe(true);

  // FINANCE approves
  const approveRes = await request(app.getHttpServer())
    .patch(`/api/admin/refund-approvals/${approvalId}/approve`)
    .set('Authorization', bearerHeader(finToken))
    .expect(200);
  expect(approveRes.body.approved).toBe(true);
  expect(approveRes.body.amount).toBe(10000);

  // RefundApproval is now EXECUTED
  const approval = await prisma.refundApproval.findUnique({ where: { id: approvalId } });
  expect(approval!.status).toBe('EXECUTED');
  expect(approval!.approvedBy).toBe(fin.id);
  expect(approval!.refundRequestId).not.toBeNull();

  // RefundRequest is COMPLETED (I-11)
  const refundReq = await prisma.refundRequest.findUnique({ where: { id: approval!.refundRequestId! } });
  expect(refundReq!.status).toBe('COMPLETED');

  // Buyer's wallet was credited (I-3)
  const wallet = await prisma.wallet.findUnique({ where: { userId: buyerUserId } });
  expect(wallet!.balance).toBe(10000);
});

// ════════════════════════════════════════════════════════════════════════
//  6. ADM-H03b — FINANCE rejects → approval REJECTED
// ════════════════════════════════════════════════════════════════════════

it('ADM-H03b: maker-checker reject path — CS_AGENT requests → FINANCE rejects → REJECTED', async () => {
  const { orderId } = await createPlacedOrder();

  const cs = await createUserByRole('CS_AGENT', { email: `mc-cs-h03b-${Date.now()}@test.com` });
  const { access_token: csToken } = await loginAs(app, cs.email, 'Test@1234');
  const reqRes = await request(app.getHttpServer())
    .post('/api/admin/refund-approvals')
    .set('Authorization', bearerHeader(csToken))
    .send({ orderId, amount: 7500, reason: 'Disputed charge' })
    .expect(201);
  const approvalId = reqRes.body.id;

  const fin = await createUserByRole('FINANCE', { email: `mc-fin-h03b-${Date.now()}@test.com` });
  const { access_token: finToken } = await loginAs(app, fin.email, 'Test@1234');
  const rejectRes = await request(app.getHttpServer())
    .patch(`/api/admin/refund-approvals/${approvalId}/reject`)
    .set('Authorization', bearerHeader(finToken))
    .send({ reason: 'Insufficient documentation' })
    .expect(200);
  expect(rejectRes.body.status).toBe('REJECTED');
  expect(rejectRes.body.rejectedBy).toBe(fin.id);
  expect(rejectRes.body.rejectedReason).toBe('Insufficient documentation');

  // Wallet NOT credited
  const approval = await prisma.refundApproval.findUnique({ where: { id: approvalId } });
  expect(approval!.refundRequestId).toBeNull();
});

// ════════════════════════════════════════════════════════════════════════
//  7. ADM-E05 — Self-approval blocked (T-AD01)
// ════════════════════════════════════════════════════════════════════════

it('ADM-E05: self-approval → ForbiddenException (same user requested and approves)', async () => {
  const { orderId } = await createPlacedOrder();

  // ADMIN can both request and approve (has both roles)
  const admin = await createAdminUser({ email: `mc-self-${Date.now()}@test.com`, password: 'Admin@1234' });
  const { access_token } = await loginAs(app, admin.email, 'Admin@1234');

  const reqRes = await request(app.getHttpServer())
    .post('/api/admin/refund-approvals')
    .set('Authorization', bearerHeader(access_token))
    .send({ orderId, amount: 8000, reason: 'Self-approval test' })
    .expect(201);
  const approvalId = reqRes.body.id;

  // Same user tries to approve their own request
  await request(app.getHttpServer())
    .patch(`/api/admin/refund-approvals/${approvalId}/approve`)
    .set('Authorization', bearerHeader(access_token))
    .expect(403);
});

// ════════════════════════════════════════════════════════════════════════
//  8. ADM-E05b — Self-rejection blocked (T-AD01)
// ════════════════════════════════════════════════════════════════════════

it('ADM-E05b: self-rejection → ForbiddenException (same user requested and rejects)', async () => {
  const { orderId } = await createPlacedOrder();
  const admin = await createAdminUser({ email: `mc-self-rej-${Date.now()}@test.com`, password: 'Admin@1234' });
  const { access_token } = await loginAs(app, admin.email, 'Admin@1234');

  const reqRes = await request(app.getHttpServer())
    .post('/api/admin/refund-approvals')
    .set('Authorization', bearerHeader(access_token))
    .send({ orderId, amount: 9000, reason: 'Self-rejection test' })
    .expect(201);
  const approvalId = reqRes.body.id;

  await request(app.getHttpServer())
    .patch(`/api/admin/refund-approvals/${approvalId}/reject`)
    .set('Authorization', bearerHeader(access_token))
    .send({ reason: 'Own rejection' })
    .expect(403);
});

// ════════════════════════════════════════════════════════════════════════
//  9. ADM-E08 — Double-approve (EXECUTED → approve again) → 400
// ════════════════════════════════════════════════════════════════════════

it('ADM-E08: double-approve already-EXECUTED approval → BadRequestException', async () => {
  const { orderId } = await createPlacedOrder();

  const cs = await createUserByRole('CS_AGENT', { email: `mc-cs-e08-${Date.now()}@test.com` });
  const { access_token: csToken } = await loginAs(app, cs.email, 'Test@1234');
  const reqRes = await request(app.getHttpServer())
    .post('/api/admin/refund-approvals')
    .set('Authorization', bearerHeader(csToken))
    .send({ orderId, amount: 6000, reason: 'Double-approve test' })
    .expect(201);
  const approvalId = reqRes.body.id;

  const fin = await createUserByRole('FINANCE', { email: `mc-fin-e08-${Date.now()}@test.com` });
  const { access_token: finToken } = await loginAs(app, fin.email, 'Test@1234');
  await request(app.getHttpServer())
    .patch(`/api/admin/refund-approvals/${approvalId}/approve`)
    .set('Authorization', bearerHeader(finToken))
    .expect(200);

  // Second approve → already EXECUTED → 400
  await request(app.getHttpServer())
    .patch(`/api/admin/refund-approvals/${approvalId}/approve`)
    .set('Authorization', bearerHeader(finToken))
    .expect(400);
});

// ════════════════════════════════════════════════════════════════════════
//  10. ADM-H01 gap doc — CS_AGENT cannot view orders (ADMIN-only endpoint)
//      Phase-2 TODO: add CS_AGENT to GET /api/orders/admin/all
// ════════════════════════════════════════════════════════════════════════

it('ADM-H01: CS_AGENT can view orders admin endpoint → 200', async () => {
  const cs = await createUserByRole('CS_AGENT', { email: `mc-cs-h01-${Date.now()}@test.com` });
  const { access_token } = await loginAs(app, cs.email, 'Test@1234');
  const res = await request(app.getHttpServer())
    .get('/api/orders/admin/all')
    .set('Authorization', bearerHeader(access_token))
    .expect(200);
  expect(Array.isArray(res.body) || Array.isArray(res.body.orders)).toBe(true);
});
