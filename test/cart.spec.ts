// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * Cart Integration Tests
 * Tests: get cart, add item, update quantity, remove item, clear cart,
 *        stock validation, upsert behaviour (adding same variant increments quantity).
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
  createVariant,
  prisma,
} from './helpers/db';
import { loginAs, bearerHeader } from './helpers/auth';

describe('Cart — Integration', () => {
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

  // ─── GET /api/cart ─────────────────────────────────────────────────────────

  describe('GET /api/cart', () => {
    it('returns an empty cart for a new user (auto-created)', async () => {
      await createUser({ email: 'cart1@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'cart1@test.com', 'Password1!');

      const res = await request(app.getHttpServer())
        .get('/api/cart')
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      expect(res.body.items).toEqual([]);
    });

    it('returns 401 without token', async () => {
      await request(app.getHttpServer()).get('/api/cart').expect(401);
    });
  });

  // ─── POST /api/cart/items ─────────────────────────────────────────────────

  describe('POST /api/cart/items', () => {
    it('adds a variant to cart', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);
      const variant = await createVariant(product.id, { stock: 10 });

      await createUser({ email: 'cart2@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'cart2@test.com', 'Password1!');

      const res = await request(app.getHttpServer())
        .post('/api/cart/items')
        .set('Authorization', bearerHeader(access_token))
        .send({ variantId: variant.id, quantity: 2 })
        .expect(201);

      expect(res.body.quantity).toBe(2);
      expect(res.body.variantId).toBe(variant.id);
    });

    it('increments quantity when adding the same variant again', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);
      const variant = await createVariant(product.id, { stock: 10 });

      await createUser({ email: 'cart3@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'cart3@test.com', 'Password1!');

      await request(app.getHttpServer())
        .post('/api/cart/items')
        .set('Authorization', bearerHeader(access_token))
        .send({ variantId: variant.id, quantity: 2 });

      const res = await request(app.getHttpServer())
        .post('/api/cart/items')
        .set('Authorization', bearerHeader(access_token))
        .send({ variantId: variant.id, quantity: 3 })
        .expect(201);

      expect(res.body.quantity).toBe(5);
    });

    it('returns 400 when quantity exceeds stock', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);
      const variant = await createVariant(product.id, { stock: 3 });

      await createUser({ email: 'cart4@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'cart4@test.com', 'Password1!');

      await request(app.getHttpServer())
        .post('/api/cart/items')
        .set('Authorization', bearerHeader(access_token))
        .send({ variantId: variant.id, quantity: 10 })
        .expect(400);
    });

    it('returns 400 when accumulated quantity exceeds stock', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);
      const variant = await createVariant(product.id, { stock: 5 });

      await createUser({ email: 'cart5@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'cart5@test.com', 'Password1!');

      await request(app.getHttpServer())
        .post('/api/cart/items')
        .set('Authorization', bearerHeader(access_token))
        .send({ variantId: variant.id, quantity: 4 });

      await request(app.getHttpServer())
        .post('/api/cart/items')
        .set('Authorization', bearerHeader(access_token))
        .send({ variantId: variant.id, quantity: 3 })
        .expect(400);
    });

    it('returns 404 for non-existent variant', async () => {
      await createUser({ email: 'cart6@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'cart6@test.com', 'Password1!');

      await request(app.getHttpServer())
        .post('/api/cart/items')
        .set('Authorization', bearerHeader(access_token))
        .send({ variantId: 99999, quantity: 1 })
        .expect(404);
    });
  });

  // ─── PATCH /api/cart/items/:id ────────────────────────────────────────────

  describe('PATCH /api/cart/items/:id', () => {
    it('updates item quantity', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);
      const variant = await createVariant(product.id, { stock: 10 });

      await createUser({ email: 'cart7@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'cart7@test.com', 'Password1!');

      const addRes = await request(app.getHttpServer())
        .post('/api/cart/items')
        .set('Authorization', bearerHeader(access_token))
        .send({ variantId: variant.id, quantity: 2 });

      const itemId = addRes.body.id;

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/cart/items/${itemId}`)
        .set('Authorization', bearerHeader(access_token))
        .send({ quantity: 5 })
        .expect(200);

      expect(updateRes.body.quantity).toBe(5);
    });

    it('returns 400 when new quantity exceeds stock', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);
      const variant = await createVariant(product.id, { stock: 3 });

      await createUser({ email: 'cart8@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'cart8@test.com', 'Password1!');

      const addRes = await request(app.getHttpServer())
        .post('/api/cart/items')
        .set('Authorization', bearerHeader(access_token))
        .send({ variantId: variant.id, quantity: 1 });

      await request(app.getHttpServer())
        .patch(`/api/cart/items/${addRes.body.id}`)
        .set('Authorization', bearerHeader(access_token))
        .send({ quantity: 99 })
        .expect(400);
    });

    it('returns 404 for item not belonging to user\'s cart', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);
      const variant = await createVariant(product.id, { stock: 10 });

      const user1 = await createUser({ email: 'cu1@test.com', password: 'Password1!' });
      await createUser({ email: 'cu2@test.com', password: 'Password1!' });

      const { access_token: token1 } = await loginAs(app, 'cu1@test.com', 'Password1!');
      const { access_token: token2 } = await loginAs(app, 'cu2@test.com', 'Password1!');

      const addRes = await request(app.getHttpServer())
        .post('/api/cart/items')
        .set('Authorization', bearerHeader(token1))
        .send({ variantId: variant.id, quantity: 1 });

      await request(app.getHttpServer())
        .patch(`/api/cart/items/${addRes.body.id}`)
        .set('Authorization', bearerHeader(token2))
        .send({ quantity: 2 })
        .expect(404);
    });
  });

  // ─── DELETE /api/cart/items/:id ───────────────────────────────────────────

  describe('DELETE /api/cart/items/:id', () => {
    it('removes an item from cart', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);
      const variant = await createVariant(product.id, { stock: 10 });

      await createUser({ email: 'cart9@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'cart9@test.com', 'Password1!');

      const addRes = await request(app.getHttpServer())
        .post('/api/cart/items')
        .set('Authorization', bearerHeader(access_token))
        .send({ variantId: variant.id, quantity: 1 });

      await request(app.getHttpServer())
        .delete(`/api/cart/items/${addRes.body.id}`)
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      const cartRes = await request(app.getHttpServer())
        .get('/api/cart')
        .set('Authorization', bearerHeader(access_token));

      expect(cartRes.body.items).toHaveLength(0);
    });
  });

  // ─── DELETE /api/cart ─────────────────────────────────────────────────────

  describe('DELETE /api/cart', () => {
    it('clears all items from cart', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);
      const v1 = await createVariant(product.id, { size: 'S', stock: 5, sku: `SKU-S-${Date.now()}` });
      const v2 = await createVariant(product.id, { size: 'L', stock: 5, sku: `SKU-L-${Date.now()}` });

      await createUser({ email: 'cart10@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'cart10@test.com', 'Password1!');

      await request(app.getHttpServer())
        .post('/api/cart/items')
        .set('Authorization', bearerHeader(access_token))
        .send({ variantId: v1.id, quantity: 1 });

      await request(app.getHttpServer())
        .post('/api/cart/items')
        .set('Authorization', bearerHeader(access_token))
        .send({ variantId: v2.id, quantity: 1 });

      await request(app.getHttpServer())
        .delete('/api/cart')
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      const cartRes = await request(app.getHttpServer())
        .get('/api/cart')
        .set('Authorization', bearerHeader(access_token));

      expect(cartRes.body.items).toHaveLength(0);
    });

    it('returns success even when cart is already empty', async () => {
      await createUser({ email: 'cart11@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'cart11@test.com', 'Password1!');

      await request(app.getHttpServer())
        .delete('/api/cart')
        .set('Authorization', bearerHeader(access_token))
        .expect(200);
    });
  });
});
