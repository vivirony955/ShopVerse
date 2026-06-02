// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import { cleanDatabase, createUser, createAdminUser, prisma } from './helpers/db';
import { loginAs, bearerHeader } from './helpers/auth';

describe('Delivery — Integration', () => {
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

  // ─── GET /api/delivery/check ──────────────────────────────────────────────

  describe('GET /api/delivery/check', () => {
    it('DEL-H01: returns correct serviceability for a known pincode', async () => {
      await prisma.pincodeServiceability.create({
        data: { country: 'IN', pincode: '110001', isServiceable: true, estimateDays: 3, courier: 'BlueDart' },
      });

      const res = await request(app.getHttpServer())
        .get('/api/delivery/check?pincode=110001')
        .expect(200);

      expect(res.body).toMatchObject({
        pincode: '110001',
        isServiceable: true,
        estimateDays: 3,
        courier: 'BlueDart',
      });
    });

    it('DEL-H02: returns isServiceable=false for explicitly non-serviceable pincode', async () => {
      await prisma.pincodeServiceability.create({
        data: { country: 'IN', pincode: '999999', isServiceable: false, estimateDays: 5 },
      });

      const res = await request(app.getHttpServer())
        .get('/api/delivery/check?pincode=999999')
        .expect(200);

      expect(res.body.isServiceable).toBe(false);
    });

    it('DEL-H03: unknown pincode defaults to serviceable with 7-day estimate', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/delivery/check?pincode=000001')
        .expect(200);

      expect(res.body).toMatchObject({
        pincode: '000001',
        isServiceable: true,
        estimateDays: 7,
      });
    });

    it('DEL-H04: check endpoint is publicly accessible without authentication', async () => {
      await request(app.getHttpServer())
        .get('/api/delivery/check?pincode=400001')
        .expect(200);
    });
  });

  // ─── GET /api/delivery/pincodes (admin) ───────────────────────────────────

  describe('GET /api/delivery/pincodes', () => {
    it('DEL-A01: admin lists all pincode records', async () => {
      const admin = await createAdminUser({ email: 'admin@test.com' });
      const { access_token } = await loginAs(app, admin.email, 'Test@1234');

      await prisma.pincodeServiceability.createMany({
        data: [
          { country: 'IN', pincode: '110001', isServiceable: true, estimateDays: 3 },
          { country: 'IN', pincode: '400001', isServiceable: true, estimateDays: 2 },
        ],
      });

      const res = await request(app.getHttpServer())
        .get('/api/delivery/pincodes')
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
    });

    it('DEL-A02: 403 for regular user', async () => {
      const user = await createUser({ email: 'user@test.com' });
      const { access_token } = await loginAs(app, user.email, 'Test@1234');

      await request(app.getHttpServer())
        .get('/api/delivery/pincodes')
        .set('Authorization', bearerHeader(access_token))
        .expect(403);
    });

    it('DEL-A03: 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/api/delivery/pincodes')
        .expect(401);
    });
  });

  // ─── POST /api/delivery/pincodes (admin) ──────────────────────────────────

  describe('POST /api/delivery/pincodes', () => {
    it('DEL-A04: admin creates a new serviceable pincode record', async () => {
      const admin = await createAdminUser({ email: 'admin@test.com' });
      const { access_token } = await loginAs(app, admin.email, 'Test@1234');

      const res = await request(app.getHttpServer())
        .post('/api/delivery/pincodes')
        .set('Authorization', bearerHeader(access_token))
        .send({ pincode: '560001', isServiceable: true, estimateDays: 4, courier: 'Delhivery' })
        .expect(201);

      expect(res.body).toMatchObject({ pincode: '560001', isServiceable: true, estimateDays: 4 });
    });

    it('DEL-A05: upsert updates an existing record without creating a duplicate', async () => {
      const admin = await createAdminUser({ email: 'admin@test.com' });
      const { access_token } = await loginAs(app, admin.email, 'Test@1234');

      await prisma.pincodeServiceability.create({
        data: { country: 'IN', pincode: '110001', isServiceable: true, estimateDays: 7 },
      });

      await request(app.getHttpServer())
        .post('/api/delivery/pincodes')
        .set('Authorization', bearerHeader(access_token))
        .send({ pincode: '110001', isServiceable: false, estimateDays: 1 })
        .expect(201);

      const count = await prisma.pincodeServiceability.count({ where: { pincode: '110001' } });
      expect(count).toBe(1);

      const record = await prisma.pincodeServiceability.findUnique({ where: { country_pincode: { country: 'IN', pincode: '110001' } } });
      expect(record?.isServiceable).toBe(false);
    });

    it('DEL-A06: 403 for regular user', async () => {
      const user = await createUser({ email: 'user@test.com' });
      const { access_token } = await loginAs(app, user.email, 'Test@1234');

      await request(app.getHttpServer())
        .post('/api/delivery/pincodes')
        .set('Authorization', bearerHeader(access_token))
        .send({ pincode: '110001', isServiceable: true, estimateDays: 3 })
        .expect(403);
    });
  });
});
