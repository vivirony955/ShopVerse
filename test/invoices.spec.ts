// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import { cleanDatabase, createUser, createAdminUser, prisma } from './helpers/db';
import { loginAs, bearerHeader } from './helpers/auth';

async function createConfirmedOrder(userId: number) {
  return prisma.order.create({
    data: {
      userId,
      addressSnapshot: {
        name: 'Test User',
        line1: '123 Main Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        phone: '9876543210',
      },
      subtotal: 1000,
      total: 1000,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      paymentMethod: 'STRIPE',
    },
  });
}

describe('Invoices — Integration', () => {
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

  // ─── GET /api/invoices/:orderId ───────────────────────────────────────────

  describe('GET /api/invoices/:orderId', () => {
    it('INV-H01: owner can download their invoice as a PDF', async () => {
      const user = await createUser({ email: 'buyer@test.com' });
      const order = await createConfirmedOrder(user.id);
      const { access_token } = await loginAs(app, user.email, 'Test@1234');

      await request(app.getHttpServer())
        .get(`/api/invoices/${order.id}`)
        .set('Authorization', bearerHeader(access_token))
        .expect(200)
        .expect('Content-Type', /pdf/);
    });

    it('INV-E01: 403 when a different user tries to download someone else\'s invoice', async () => {
      const owner = await createUser({ email: 'owner@test.com' });
      const other = await createUser({ email: 'other@test.com' });
      const order = await createConfirmedOrder(owner.id);
      const { access_token } = await loginAs(app, other.email, 'Test@1234');

      await request(app.getHttpServer())
        .get(`/api/invoices/${order.id}`)
        .set('Authorization', bearerHeader(access_token))
        .expect(403);
    });

    it('INV-E02: 404 for a non-existent order', async () => {
      const user = await createUser({ email: 'user@test.com' });
      const { access_token } = await loginAs(app, user.email, 'Test@1234');

      await request(app.getHttpServer())
        .get('/api/invoices/999999')
        .set('Authorization', bearerHeader(access_token))
        .expect(404);
    });

    it('INV-H02: 401 without token', async () => {
      const user = await createUser({ email: 'user@test.com' });
      const order = await createConfirmedOrder(user.id);

      await request(app.getHttpServer())
        .get(`/api/invoices/${order.id}`)
        .expect(401);
    });

    it('INV-A01: admin can download any user\'s invoice', async () => {
      const user = await createUser({ email: 'buyer@test.com' });
      const admin = await createAdminUser({ email: 'admin@test.com' });
      const order = await createConfirmedOrder(user.id);
      const { access_token } = await loginAs(app, admin.email, 'Test@1234');

      await request(app.getHttpServer())
        .get(`/api/invoices/${order.id}`)
        .set('Authorization', bearerHeader(access_token))
        .expect(200)
        .expect('Content-Type', /pdf/);
    });
  });

  // ─── Invoice record and sequence (I-13) ──────────────────────────────────

  describe('Invoice sequence (I-13)', () => {
    it('INV-H03: invoice number follows INV/YYYY-YY/NNNNNN format', async () => {
      const user = await createUser({ email: 'buyer@test.com' });
      const order = await createConfirmedOrder(user.id);

      await prisma.invoiceSequence.create({ data: { financialYear: '2026-27', lastSequence: 0 } });
      await prisma.invoice.create({
        data: {
          orderId: order.id,
          invoiceNumber: 'INV/2026-27/000001',
          financialYear: '2026-27',
          sequence: 1,
          subtotal: 1000,
          discountAmount: 0,
          shippingFee: 0,
          taxAmount: 0,
          total: 1000,
        },
      });

      const invoice = await prisma.invoice.findUnique({ where: { orderId: order.id } });
      expect(invoice?.invoiceNumber).toMatch(/^INV\/\d{4}-\d{2}\/\d{6}$/);
    });

    it('INV-H04: each order has at most one invoice (@@unique orderId)', async () => {
      const user = await createUser({ email: 'buyer@test.com' });
      const order = await createConfirmedOrder(user.id);

      await prisma.invoice.create({
        data: {
          orderId: order.id,
          invoiceNumber: 'INV/2026-27/000001',
          financialYear: '2026-27',
          sequence: 1,
          subtotal: 1000,
          discountAmount: 0,
          shippingFee: 0,
          taxAmount: 0,
          total: 1000,
        },
      });

      // Second insert for the same order must fail (unique constraint on orderId)
      await expect(
        prisma.invoice.create({
          data: {
            orderId: order.id,
            invoiceNumber: 'INV/2026-27/000002',
            financialYear: '2026-27',
            sequence: 2,
            subtotal: 1000,
            discountAmount: 0,
            shippingFee: 0,
            taxAmount: 0,
            total: 1000,
          },
        }),
      ).rejects.toThrow();
    });

    it('INV-H05: two orders get sequential, unique invoice numbers within same FY', async () => {
      const user = await createUser({ email: 'buyer@test.com' });
      const order1 = await createConfirmedOrder(user.id);
      const order2 = await createConfirmedOrder(user.id);

      await prisma.invoice.createMany({
        data: [
          {
            orderId: order1.id,
            invoiceNumber: 'INV/2026-27/000001',
            financialYear: '2026-27',
            sequence: 1,
            subtotal: 1000,
            discountAmount: 0,
            shippingFee: 0,
            taxAmount: 0,
            total: 1000,
          },
          {
            orderId: order2.id,
            invoiceNumber: 'INV/2026-27/000002',
            financialYear: '2026-27',
            sequence: 2,
            subtotal: 2000,
            discountAmount: 0,
            shippingFee: 0,
            taxAmount: 0,
            total: 2000,
          },
        ],
      });

      const invoices = await prisma.invoice.findMany({
        where: { financialYear: '2026-27' },
        orderBy: { sequence: 'asc' },
      });

      expect(invoices).toHaveLength(2);
      expect(invoices[0].sequence).toBe(1);
      expect(invoices[1].sequence).toBe(2);
      // No gaps in sequence
      expect(invoices[1].sequence - invoices[0].sequence).toBe(1);
    });
  });
});
