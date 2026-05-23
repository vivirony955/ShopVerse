// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import { cleanDatabase, prisma } from './helpers/db';
import { makeShopper, cleanQATables } from './helpers/factories';

const GUEST_ADDRESS = {
  fullName: 'Guest User',
  line1: '123 Test Street',
  city: 'Mumbai',
  state: 'Maharashtra',
  pincode: '400001',
  country: 'India',
  phone: '9876543210',
};

describe('Guest Checkout — Integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    await cleanQATables();
  });

  // ─── POST /api/orders/guest ───────────────────────────────────────────────

  describe('POST /api/orders/guest', () => {
    it('GUE-H01: guest places an order with valid email, address, and items', async () => {
      const shopper = await makeShopper({ stock: 10 });

      const res = await request(app.getHttpServer())
        .post('/api/orders/guest')
        .send({
          email: 'guest@test.com',
          address: GUEST_ADDRESS,
          items: [{ variantId: shopper.variant.id, quantity: 1 }],
        })
        .expect(201);

      expect(res.body.id).toEqual(expect.any(Number));
      expect(res.body.guestEmail).toBe('guest@test.com');

      const order = await prisma.order.findUnique({ where: { id: res.body.id } });
      expect(order).not.toBeNull();
    });

    it('GUE-H02: guest order decrements available stock (reserve model)', async () => {
      const shopper = await makeShopper({ stock: 5 });

      const before = await prisma.variant.findUnique({ where: { id: shopper.variant.id } });
      const availBefore = before!.stock - before!.reservedStock;

      await request(app.getHttpServer())
        .post('/api/orders/guest')
        .send({
          email: 'guest@test.com',
          address: GUEST_ADDRESS,
          items: [{ variantId: shopper.variant.id, quantity: 2 }],
        })
        .expect(201);

      const after = await prisma.variant.findUnique({ where: { id: shopper.variant.id } });
      const availAfter = after!.stock - after!.reservedStock;
      expect(availAfter).toBe(availBefore - 2);
    });

    it('GUE-E01: 400 when items array is empty', async () => {
      await request(app.getHttpServer())
        .post('/api/orders/guest')
        .send({
          email: 'guest@test.com',
          address: GUEST_ADDRESS,
          items: [],
        })
        .expect(400);
    });

    it('GUE-E02: 400 when email is missing', async () => {
      const shopper = await makeShopper({ stock: 5 });

      await request(app.getHttpServer())
        .post('/api/orders/guest')
        .send({
          address: GUEST_ADDRESS,
          items: [{ variantId: shopper.variant.id, quantity: 1 }],
        })
        .expect(400);
    });

    it('GUE-E03: 400 when email format is invalid', async () => {
      const shopper = await makeShopper({ stock: 5 });

      await request(app.getHttpServer())
        .post('/api/orders/guest')
        .send({
          email: 'not-an-email',
          address: GUEST_ADDRESS,
          items: [{ variantId: shopper.variant.id, quantity: 1 }],
        })
        .expect(400);
    });

    it('GUE-E04: 404 when variant does not exist', async () => {
      await request(app.getHttpServer())
        .post('/api/orders/guest')
        .send({
          email: 'guest@test.com',
          address: GUEST_ADDRESS,
          items: [{ variantId: 999999, quantity: 1 }],
        })
        .expect(404);
    });

    it('GUE-E05: 400 when requested quantity exceeds available stock', async () => {
      const shopper = await makeShopper({ stock: 2 });

      await request(app.getHttpServer())
        .post('/api/orders/guest')
        .send({
          email: 'guest@test.com',
          address: GUEST_ADDRESS,
          items: [{ variantId: shopper.variant.id, quantity: 10 }],
        })
        .expect(400);
    });

    it('GUE-E06: 400 when required address field is missing', async () => {
      const shopper = await makeShopper({ stock: 5 });

      await request(app.getHttpServer())
        .post('/api/orders/guest')
        .send({
          email: 'guest@test.com',
          address: { fullName: 'Test', line1: '123 St', city: 'Mumbai' },
          items: [{ variantId: shopper.variant.id, quantity: 1 }],
        })
        .expect(400);
    });

    it('GUE-H03: guest order is publicly accessible without an auth token', async () => {
      const shopper = await makeShopper({ stock: 5 });

      await request(app.getHttpServer())
        .post('/api/orders/guest')
        .send({
          email: 'guest2@test.com',
          address: GUEST_ADDRESS,
          items: [{ variantId: shopper.variant.id, quantity: 1 }],
        })
        .expect(201);
    });
  });
});
