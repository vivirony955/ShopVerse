// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * Wishlist Integration Tests
 * Tests: get wishlist, add product, remove product, duplicate add, non-existent product.
 */
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import {
  cleanDatabase,
  createUser,
  createCategory,
  createBrand,
  createProduct,
} from './helpers/db';
import { loginAs, bearerHeader } from './helpers/auth';

describe('Wishlist — Integration', () => {
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

  // ─── GET /api/wishlist ─────────────────────────────────────────────────────

  describe('GET /api/wishlist', () => {
    it('returns empty array for new user', async () => {
      await createUser({ email: 'wl1@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'wl1@test.com', 'Password1!');

      const res = await request(app.getHttpServer())
        .get('/api/wishlist')
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('returns 401 without token', async () => {
      await request(app.getHttpServer()).get('/api/wishlist').expect(401);
    });

    it('returns wishlist with product details', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id, { name: 'Wishlist Product', slug: 'wl-product' });

      await createUser({ email: 'wl2@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'wl2@test.com', 'Password1!');

      await request(app.getHttpServer())
        .post(`/api/wishlist/${product.id}`)
        .set('Authorization', bearerHeader(access_token));

      const res = await request(app.getHttpServer())
        .get('/api/wishlist')
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].product.name).toBe('Wishlist Product');
    });
  });

  // ─── POST /api/wishlist/:productId ────────────────────────────────────────

  describe('POST /api/wishlist/:productId', () => {
    it('adds a product to wishlist', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id, { slug: 'wl-add' });

      await createUser({ email: 'wl3@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'wl3@test.com', 'Password1!');

      const res = await request(app.getHttpServer())
        .post(`/api/wishlist/${product.id}`)
        .set('Authorization', bearerHeader(access_token))
        .expect(201);

      expect(res.body.productId).toBe(product.id);
    });

    it('returns 409 when product is already in wishlist', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id, { slug: 'wl-dup' });

      await createUser({ email: 'wl4@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'wl4@test.com', 'Password1!');

      await request(app.getHttpServer())
        .post(`/api/wishlist/${product.id}`)
        .set('Authorization', bearerHeader(access_token));

      await request(app.getHttpServer())
        .post(`/api/wishlist/${product.id}`)
        .set('Authorization', bearerHeader(access_token))
        .expect(409);
    });

    it('returns 404 for non-existent product', async () => {
      await createUser({ email: 'wl5@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'wl5@test.com', 'Password1!');

      await request(app.getHttpServer())
        .post('/api/wishlist/99999')
        .set('Authorization', bearerHeader(access_token))
        .expect(404);
    });

    it('two different users can wishlist the same product', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id, { slug: 'wl-shared' });

      await createUser({ email: 'wl6a@test.com', password: 'Password1!' });
      await createUser({ email: 'wl6b@test.com', password: 'Password1!' });

      const { access_token: t1 } = await loginAs(app, 'wl6a@test.com', 'Password1!');
      const { access_token: t2 } = await loginAs(app, 'wl6b@test.com', 'Password1!');

      await request(app.getHttpServer())
        .post(`/api/wishlist/${product.id}`)
        .set('Authorization', bearerHeader(t1))
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/wishlist/${product.id}`)
        .set('Authorization', bearerHeader(t2))
        .expect(201);
    });
  });

  // ─── DELETE /api/wishlist/:productId ─────────────────────────────────────

  describe('DELETE /api/wishlist/:productId', () => {
    it('removes a product from wishlist', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id, { slug: 'wl-remove' });

      await createUser({ email: 'wl7@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'wl7@test.com', 'Password1!');

      await request(app.getHttpServer())
        .post(`/api/wishlist/${product.id}`)
        .set('Authorization', bearerHeader(access_token));

      await request(app.getHttpServer())
        .delete(`/api/wishlist/${product.id}`)
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      const listRes = await request(app.getHttpServer())
        .get('/api/wishlist')
        .set('Authorization', bearerHeader(access_token));

      expect(listRes.body).toHaveLength(0);
    });

    it('returns 404 when product is not in wishlist', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id, { slug: 'wl-notfound' });

      await createUser({ email: 'wl8@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'wl8@test.com', 'Password1!');

      await request(app.getHttpServer())
        .delete(`/api/wishlist/${product.id}`)
        .set('Authorization', bearerHeader(access_token))
        .expect(404);
    });

    it('user can only remove from their own wishlist', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id, { slug: 'wl-own' });

      await createUser({ email: 'wl9a@test.com', password: 'Password1!' });
      await createUser({ email: 'wl9b@test.com', password: 'Password1!' });

      const { access_token: t1 } = await loginAs(app, 'wl9a@test.com', 'Password1!');
      const { access_token: t2 } = await loginAs(app, 'wl9b@test.com', 'Password1!');

      // User 1 adds, user 2 tries to remove
      await request(app.getHttpServer())
        .post(`/api/wishlist/${product.id}`)
        .set('Authorization', bearerHeader(t1));

      await request(app.getHttpServer())
        .delete(`/api/wishlist/${product.id}`)
        .set('Authorization', bearerHeader(t2))
        .expect(404);
    });
  });
});
