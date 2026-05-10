/**
 * Coupons Integration Tests
 * Tests: validate coupon (valid, expired, usage limit, min amount, inactive),
 *        percentage vs fixed discount calculation, admin CRUD.
 */
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import {
  cleanDatabase,
  createUser,
  createAdminUser,
  createCoupon,
  prisma,
} from './helpers/db';
import { loginAs, bearerHeader } from './helpers/auth';

describe('Coupons — Integration', () => {
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

  // ─── POST /api/coupons/validate ───────────────────────────────────────────

  describe('POST /api/coupons/validate', () => {
    it('validates an active percentage coupon and returns discount amount', async () => {
      await createCoupon({
        code: 'PERCENT20',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        minOrderAmount: 0,
      });

      const res = await request(app.getHttpServer())
        .post('/api/coupons/validate')
        .send({ code: 'PERCENT20', orderAmount: 1000 })
        .expect(200);

      expect(res.body.valid).toBe(true);
      expect(res.body.discount).toBeCloseTo(200); // 20% of 1000
      expect(res.body.coupon.code).toBe('PERCENT20');
    });

    it('validates an active fixed coupon and returns discount amount', async () => {
      await createCoupon({
        code: 'FIXED150',
        discountType: 'FIXED',
        discountValue: 150,
        minOrderAmount: 0,
      });

      const res = await request(app.getHttpServer())
        .post('/api/coupons/validate')
        .send({ code: 'FIXED150', orderAmount: 1000 })
        .expect(200);

      expect(res.body.valid).toBe(true);
      expect(res.body.discount).toBe(150);
    });

    it('caps fixed discount at order amount (no negative totals)', async () => {
      await createCoupon({
        code: 'BIGFLAT',
        discountType: 'FIXED',
        discountValue: 5000,
        minOrderAmount: 0,
      });

      const res = await request(app.getHttpServer())
        .post('/api/coupons/validate')
        .send({ code: 'BIGFLAT', orderAmount: 200 })
        .expect(200);

      expect(res.body.discount).toBe(200); // capped at order amount
    });

    it('caps percentage discount at 100% (full order amount)', async () => {
      await createCoupon({
        code: 'FULLPCT',
        discountType: 'PERCENTAGE',
        discountValue: 100,
        minOrderAmount: 0,
      });

      const res = await request(app.getHttpServer())
        .post('/api/coupons/validate')
        .send({ code: 'FULLPCT', orderAmount: 500 })
        .expect(200);

      expect(res.body.discount).toBe(500); // capped at order amount
    });

    it('returns 404 for non-existent coupon code', async () => {
      await request(app.getHttpServer())
        .post('/api/coupons/validate')
        .send({ code: 'NOSUCHCODE', orderAmount: 1000 })
        .expect(404);
    });

    it('returns 404 for inactive coupon', async () => {
      await createCoupon({ code: 'INACTIVE', isActive: false });

      await request(app.getHttpServer())
        .post('/api/coupons/validate')
        .send({ code: 'INACTIVE', orderAmount: 1000 })
        .expect(404);
    });

    it('returns 400 for expired coupon', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await createCoupon({
        code: 'EXPIRED',
        expiresAt: yesterday,
      });

      await request(app.getHttpServer())
        .post('/api/coupons/validate')
        .send({ code: 'EXPIRED', orderAmount: 1000 })
        .expect(400);
    });

    it('returns 400 when usage limit is reached', async () => {
      await createCoupon({ code: 'MAXUSED', maxUses: 1 });

      // Manually set usedCount to maxUses
      await prisma.coupon.update({
        where: { code: 'MAXUSED' },
        data: { usedCount: 1 },
      });

      await request(app.getHttpServer())
        .post('/api/coupons/validate')
        .send({ code: 'MAXUSED', orderAmount: 1000 })
        .expect(400);
    });

    it('returns 400 when order amount is below minimum', async () => {
      await createCoupon({
        code: 'MINAMT',
        minOrderAmount: 500,
      });

      await request(app.getHttpServer())
        .post('/api/coupons/validate')
        .send({ code: 'MINAMT', orderAmount: 300 })
        .expect(400);
    });

    it('succeeds when order amount exactly meets minimum', async () => {
      await createCoupon({
        code: 'EXACTMIN',
        minOrderAmount: 500,
        discountValue: 50,
      });

      const res = await request(app.getHttpServer())
        .post('/api/coupons/validate')
        .send({ code: 'EXACTMIN', orderAmount: 500 })
        .expect(200);

      expect(res.body.valid).toBe(true);
    });

    it('is publicly accessible without authentication', async () => {
      await createCoupon({ code: 'PUBLIC10' });

      await request(app.getHttpServer())
        .post('/api/coupons/validate')
        .send({ code: 'PUBLIC10', orderAmount: 1000 })
        .expect(200);
    });

    it('a coupon with null maxUses has unlimited uses', async () => {
      await createCoupon({ code: 'UNLIMITED', maxUses: null });

      // Set high used count — should still validate
      await prisma.coupon.update({
        where: { code: 'UNLIMITED' },
        data: { usedCount: 9999 },
      });

      const res = await request(app.getHttpServer())
        .post('/api/coupons/validate')
        .send({ code: 'UNLIMITED', orderAmount: 1000 })
        .expect(200);

      expect(res.body.valid).toBe(true);
    });
  });

  // ─── Admin: GET /api/coupons ───────────────────────────────────────────────

  describe('GET /api/coupons (admin only)', () => {
    it('admin lists all coupons', async () => {
      await createCoupon({ code: 'A1' });
      await createCoupon({ code: 'A2' });
      await createAdminUser({ email: 'admin@test.com', password: 'Admin@123' });
      const { access_token } = await loginAs(app, 'admin@test.com', 'Admin@123');

      const res = await request(app.getHttpServer())
        .get('/api/coupons')
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });

    it('returns 403 for regular user', async () => {
      await createUser({ email: 'notadmin@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'notadmin@test.com', 'Password1!');

      await request(app.getHttpServer())
        .get('/api/coupons')
        .set('Authorization', bearerHeader(access_token))
        .expect(403);
    });

    it('returns 401 for unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/api/coupons').expect(401);
    });
  });

  // ─── Admin: POST /api/coupons ─────────────────────────────────────────────

  describe('POST /api/coupons (admin only)', () => {
    it('admin creates a coupon', async () => {
      await createAdminUser({ email: 'admin2@test.com', password: 'Admin@123' });
      const { access_token } = await loginAs(app, 'admin2@test.com', 'Admin@123');

      const future = new Date();
      future.setMonth(future.getMonth() + 1);

      const res = await request(app.getHttpServer())
        .post('/api/coupons')
        .set('Authorization', bearerHeader(access_token))
        .send({
          code: 'NEWCOUP',
          discountType: 'PERCENTAGE',
          discountValue: 15,
          minOrderAmount: 200,
          maxUses: 100,
          expiresAt: future.toISOString(),
        })
        .expect(201);

      expect(res.body.code).toBe('NEWCOUP');
      expect(res.body.discountValue).toBe(15);
      expect(res.body.isActive).toBe(true);
    });

    it('returns 403 for regular user', async () => {
      await createUser({ email: 'notadmin2@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'notadmin2@test.com', 'Password1!');

      await request(app.getHttpServer())
        .post('/api/coupons')
        .set('Authorization', bearerHeader(access_token))
        .send({ code: 'HACK', discountType: 'FIXED', discountValue: 9999 })
        .expect(403);
    });
  });

  // ─── Admin: PATCH /api/coupons/:id ────────────────────────────────────────

  describe('PATCH /api/coupons/:id (admin only)', () => {
    it('admin updates a coupon', async () => {
      const coupon = await createCoupon({ code: 'UPDATEME' });
      await createAdminUser({ email: 'admin3@test.com', password: 'Admin@123' });
      const { access_token } = await loginAs(app, 'admin3@test.com', 'Admin@123');

      const res = await request(app.getHttpServer())
        .patch(`/api/coupons/${coupon.id}`)
        .set('Authorization', bearerHeader(access_token))
        .send({ discountValue: 25, isActive: false })
        .expect(200);

      expect(res.body.discountValue).toBe(25);
      expect(res.body.isActive).toBe(false);
    });

    it('returns 404 for non-existent coupon', async () => {
      await createAdminUser({ email: 'admin4@test.com', password: 'Admin@123' });
      const { access_token } = await loginAs(app, 'admin4@test.com', 'Admin@123');

      await request(app.getHttpServer())
        .patch('/api/coupons/99999')
        .set('Authorization', bearerHeader(access_token))
        .send({ discountValue: 5 })
        .expect(404);
    });
  });

  // ─── Admin: DELETE /api/coupons/:id ───────────────────────────────────────

  describe('DELETE /api/coupons/:id (admin only)', () => {
    it('admin deletes a coupon', async () => {
      const coupon = await createCoupon({ code: 'DELETEME' });
      await createAdminUser({ email: 'admin5@test.com', password: 'Admin@123' });
      const { access_token } = await loginAs(app, 'admin5@test.com', 'Admin@123');

      await request(app.getHttpServer())
        .delete(`/api/coupons/${coupon.id}`)
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      const found = await prisma.coupon.findUnique({ where: { id: coupon.id } });
      expect(found).toBeNull();
    });

    it('returns 404 for non-existent coupon', async () => {
      await createAdminUser({ email: 'admin6@test.com', password: 'Admin@123' });
      const { access_token } = await loginAs(app, 'admin6@test.com', 'Admin@123');

      await request(app.getHttpServer())
        .delete('/api/coupons/99999')
        .set('Authorization', bearerHeader(access_token))
        .expect(404);
    });
  });
});
