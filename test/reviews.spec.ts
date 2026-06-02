// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * Reviews Integration Tests
 * Tests: list product reviews with avg rating, create review, update own review,
 *        cannot update others' review, delete own review, admin can delete any,
 *        duplicate review per user+product is rejected, pagination.
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
  prisma,
} from './helpers/db';
import { loginAs, bearerHeader } from './helpers/auth';

describe('Reviews — Integration', () => {
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

  // ─── GET /api/reviews/product/:productId ──────────────────────────────────

  describe('GET /api/reviews/product/:productId', () => {
    it('returns empty reviews and zero avgRating for product with no reviews', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);

      const res = await request(app.getHttpServer())
        .get(`/api/reviews/product/${product.id}`)
        .expect(200);

      expect(res.body.reviews).toEqual([]);
      expect(res.body.total).toBe(0);
      expect(res.body.avgRating).toBe(0);
    });

    it('returns reviews with correct avgRating', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);

      const user1 = await createUser({ email: 'rev1@test.com', password: 'Password1!' });
      const user2 = await createUser({ email: 'rev2@test.com', password: 'Password1!' });

      await prisma.review.createMany({
        data: [
          { userId: user1.id, productId: product.id, rating: 4, title: 'Good' },
          { userId: user2.id, productId: product.id, rating: 2, title: 'Bad' },
        ],
      });

      const res = await request(app.getHttpServer())
        .get(`/api/reviews/product/${product.id}`)
        .expect(200);

      expect(res.body.total).toBe(2);
      expect(res.body.avgRating).toBe(3); // (4+2)/2
      expect(res.body.reviews).toHaveLength(2);
      expect(res.body.reviews[0].user).toBeDefined();
    });

    it('paginates reviews (page/limit)', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);

      // Create 5 users and 5 reviews
      for (let i = 0; i < 5; i++) {
        const u = await createUser({ email: `revpag${i}@test.com`, password: 'Password1!' });
        await prisma.review.create({
          data: { userId: u.id, productId: product.id, rating: 3 },
        });
      }

      const res = await request(app.getHttpServer())
        .get(`/api/reviews/product/${product.id}?page=1&limit=3`)
        .expect(200);

      expect(res.body.reviews).toHaveLength(3);
      expect(res.body.total).toBe(5);

      const page2 = await request(app.getHttpServer())
        .get(`/api/reviews/product/${product.id}?page=2&limit=3`)
        .expect(200);

      expect(page2.body.reviews).toHaveLength(2);
    });

    it('is publicly accessible without authentication', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);

      await request(app.getHttpServer())
        .get(`/api/reviews/product/${product.id}`)
        .expect(200);
    });
  });

  // ─── POST /api/reviews/product/:productId ─────────────────────────────────

  describe('POST /api/reviews/product/:productId', () => {
    it('creates a review with rating, title and body', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);
      await createUser({ email: 'crev1@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'crev1@test.com', 'Password1!');

      const res = await request(app.getHttpServer())
        .post(`/api/reviews/product/${product.id}`)
        .set('Authorization', bearerHeader(access_token))
        .send({ rating: 5, title: 'Excellent!', body: 'Really loved this product.' })
        .expect(201);

      expect(res.body.rating).toBe(5);
      expect(res.body.title).toBe('Excellent!');
      expect(res.body.body).toBe('Really loved this product.');
    });

    it('creates a review with only rating (title and body optional)', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);
      await createUser({ email: 'crev2@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'crev2@test.com', 'Password1!');

      const res = await request(app.getHttpServer())
        .post(`/api/reviews/product/${product.id}`)
        .set('Authorization', bearerHeader(access_token))
        .send({ rating: 3 })
        .expect(201);

      expect(res.body.rating).toBe(3);
    });

    it('returns 409 when user reviews the same product twice', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);
      await createUser({ email: 'duprev@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'duprev@test.com', 'Password1!');

      await request(app.getHttpServer())
        .post(`/api/reviews/product/${product.id}`)
        .set('Authorization', bearerHeader(access_token))
        .send({ rating: 4 });

      await request(app.getHttpServer())
        .post(`/api/reviews/product/${product.id}`)
        .set('Authorization', bearerHeader(access_token))
        .send({ rating: 5 })
        .expect(409);
    });

    it('returns 404 for non-existent product', async () => {
      await createUser({ email: 'revnotfound@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'revnotfound@test.com', 'Password1!');

      await request(app.getHttpServer())
        .post('/api/reviews/product/99999')
        .set('Authorization', bearerHeader(access_token))
        .send({ rating: 4 })
        .expect(404);
    });

    it('returns 400 for invalid rating (out of 1-5 range)', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);
      await createUser({ email: 'badrating@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'badrating@test.com', 'Password1!');

      await request(app.getHttpServer())
        .post(`/api/reviews/product/${product.id}`)
        .set('Authorization', bearerHeader(access_token))
        .send({ rating: 6 })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/api/reviews/product/${product.id}`)
        .set('Authorization', bearerHeader(access_token))
        .send({ rating: 0 })
        .expect(400);
    });

    it('returns 401 without authentication', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);

      await request(app.getHttpServer())
        .post(`/api/reviews/product/${product.id}`)
        .send({ rating: 3 })
        .expect(401);
    });
  });

  // ─── PATCH /api/reviews/:id ────────────────────────────────────────────────

  describe('PATCH /api/reviews/:id', () => {
    it('owner can update their review', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);
      await createUser({ email: 'updrev@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'updrev@test.com', 'Password1!');

      const createRes = await request(app.getHttpServer())
        .post(`/api/reviews/product/${product.id}`)
        .set('Authorization', bearerHeader(access_token))
        .send({ rating: 3, title: 'Ok' });

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/reviews/${createRes.body.id}`)
        .set('Authorization', bearerHeader(access_token))
        .send({ rating: 5, title: 'Changed my mind!' })
        .expect(200);

      expect(updateRes.body.rating).toBe(5);
      expect(updateRes.body.title).toBe('Changed my mind!');
    });

    it('returns 403 when non-owner tries to update review', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);
      const user1 = await createUser({ email: 'revown1@test.com', password: 'Password1!' });
      await createUser({ email: 'revown2@test.com', password: 'Password1!' });

      const { access_token: t1 } = await loginAs(app, 'revown1@test.com', 'Password1!');
      const { access_token: t2 } = await loginAs(app, 'revown2@test.com', 'Password1!');

      const createRes = await request(app.getHttpServer())
        .post(`/api/reviews/product/${product.id}`)
        .set('Authorization', bearerHeader(t1))
        .send({ rating: 3 });

      await request(app.getHttpServer())
        .patch(`/api/reviews/${createRes.body.id}`)
        .set('Authorization', bearerHeader(t2))
        .send({ rating: 1 })
        .expect(403);
    });

    it('returns 404 for non-existent review', async () => {
      await createUser({ email: 'revupd404@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'revupd404@test.com', 'Password1!');

      await request(app.getHttpServer())
        .patch('/api/reviews/99999')
        .set('Authorization', bearerHeader(access_token))
        .send({ rating: 4 })
        .expect(404);
    });
  });

  // ─── DELETE /api/reviews/:id ──────────────────────────────────────────────

  describe('DELETE /api/reviews/:id', () => {
    it('owner can delete their review', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);
      await createUser({ email: 'delrev@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'delrev@test.com', 'Password1!');

      const createRes = await request(app.getHttpServer())
        .post(`/api/reviews/product/${product.id}`)
        .set('Authorization', bearerHeader(access_token))
        .send({ rating: 4 });

      await request(app.getHttpServer())
        .delete(`/api/reviews/${createRes.body.id}`)
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      const listRes = await request(app.getHttpServer())
        .get(`/api/reviews/product/${product.id}`);
      expect(listRes.body.total).toBe(0);
    });

    it('returns 403 when non-owner non-admin tries to delete review', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);
      const user1 = await createUser({ email: 'rdelown1@test.com', password: 'Password1!' });
      await createUser({ email: 'rdelown2@test.com', password: 'Password1!' });

      const { access_token: t1 } = await loginAs(app, 'rdelown1@test.com', 'Password1!');
      const { access_token: t2 } = await loginAs(app, 'rdelown2@test.com', 'Password1!');

      const createRes = await request(app.getHttpServer())
        .post(`/api/reviews/product/${product.id}`)
        .set('Authorization', bearerHeader(t1))
        .send({ rating: 3 });

      await request(app.getHttpServer())
        .delete(`/api/reviews/${createRes.body.id}`)
        .set('Authorization', bearerHeader(t2))
        .expect(403);
    });

    it('admin can delete any review', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);
      await createUser({ email: 'adminrevdel@test.com', password: 'Password1!' });
      await createAdminUser({ email: 'adminrevdel-adm@test.com', password: 'Admin@123' });

      const { access_token: userToken } = await loginAs(app, 'adminrevdel@test.com', 'Password1!');
      const { access_token: adminToken } = await loginAs(app, 'adminrevdel-adm@test.com', 'Admin@123');

      const createRes = await request(app.getHttpServer())
        .post(`/api/reviews/product/${product.id}`)
        .set('Authorization', bearerHeader(userToken))
        .send({ rating: 2, body: 'Spam review' });

      await request(app.getHttpServer())
        .delete(`/api/reviews/${createRes.body.id}`)
        .set('Authorization', bearerHeader(adminToken))
        .expect(200);

      const listRes = await request(app.getHttpServer())
        .get(`/api/reviews/product/${product.id}`);
      expect(listRes.body.total).toBe(0);
    });

    it('returns 404 for non-existent review', async () => {
      await createUser({ email: 'revdel404@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'revdel404@test.com', 'Password1!');

      await request(app.getHttpServer())
        .delete('/api/reviews/99999')
        .set('Authorization', bearerHeader(access_token))
        .expect(404);
    });
  });
});
