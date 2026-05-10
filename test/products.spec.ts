// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * Products Integration Tests
 * Tests: list with filters/pagination/search, get one, admin CRUD, variant management.
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
  prisma,
} from './helpers/db';
import { loginAs, bearerHeader } from './helpers/auth';

describe('Products — Integration', () => {
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

  // ─── GET /api/products ─────────────────────────────────────────────────────

  describe('GET /api/products', () => {
    it('returns paginated result with no products', async () => {
      const res = await request(app.getHttpServer()).get('/api/products').expect(200);
      expect(res.body).toMatchObject({ items: [], total: 0, page: 1, totalPages: 0 });
    });

    it('returns products with default pagination', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      await createProduct(cat.id, brand.id, { name: 'Alpha Tee', slug: 'alpha-tee' });
      await createProduct(cat.id, brand.id, { name: 'Beta Shirt', slug: 'beta-shirt' });

      const res = await request(app.getHttpServer()).get('/api/products').expect(200);
      expect(res.body.total).toBe(2);
      expect(res.body.items).toHaveLength(2);
    });

    it('filters products by category slug', async () => {
      const catMen = await createCategory({ name: 'Men', slug: 'men' });
      const catWomen = await createCategory({ name: 'Women', slug: 'women' });
      const brand = await createBrand();
      await createProduct(catMen.id, brand.id, { name: 'Men Shirt', slug: 'men-shirt' });
      await createProduct(catWomen.id, brand.id, { name: 'Women Dress', slug: 'women-dress' });

      const res = await request(app.getHttpServer())
        .get('/api/products?category=men')
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.items[0].name).toBe('Men Shirt');
    });

    it('filters products by brand slug', async () => {
      const cat = await createCategory();
      const nikeB = await createBrand({ name: 'Nike', slug: 'nike' });
      const adidasB = await createBrand({ name: 'Adidas', slug: 'adidas' });
      await createProduct(cat.id, nikeB.id, { slug: 'nike-shoe' });
      await createProduct(cat.id, adidasB.id, { slug: 'adidas-shoe' });

      const res = await request(app.getHttpServer())
        .get('/api/products?brand=nike')
        .expect(200);

      expect(res.body.total).toBe(1);
    });

    it('filters products by minPrice and maxPrice', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      await createProduct(cat.id, brand.id, { slug: 'cheap', basePrice: 100 });
      await createProduct(cat.id, brand.id, { slug: 'mid', basePrice: 500 });
      await createProduct(cat.id, brand.id, { slug: 'expensive', basePrice: 2000 });

      const res = await request(app.getHttpServer())
        .get('/api/products?minPrice=200&maxPrice=1000')
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.items[0].basePrice).toBe(500);
    });

    it('searches products by name', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      await createProduct(cat.id, brand.id, { name: 'Blue Denim Jeans', slug: 'blue-denim' });
      await createProduct(cat.id, brand.id, { name: 'Red Cotton Shirt', slug: 'red-shirt' });

      const res = await request(app.getHttpServer())
        .get('/api/products?search=denim')
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.items[0].name).toBe('Blue Denim Jeans');
    });

    it('filters by size (only variants with matching size and stock > 0)', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const p1 = await createProduct(cat.id, brand.id, { slug: 'p-small' });
      const p2 = await createProduct(cat.id, brand.id, { slug: 'p-large' });
      await createVariant(p1.id, { size: 'S', stock: 5 });
      await createVariant(p2.id, { size: 'XL', stock: 5 });

      const res = await request(app.getHttpServer())
        .get('/api/products?size=S')
        .expect(200);

      expect(res.body.total).toBe(1);
    });

    it('paginates results correctly', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      for (let i = 0; i < 5; i++) {
        await createProduct(cat.id, brand.id, { slug: `product-page-${i}-${Date.now()}` });
      }

      const page1 = await request(app.getHttpServer())
        .get('/api/products?limit=2&page=1')
        .expect(200);

      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.totalPages).toBe(3);

      const page3 = await request(app.getHttpServer())
        .get('/api/products?limit=2&page=3')
        .expect(200);

      expect(page3.body.items).toHaveLength(1);
    });

    it('excludes inactive products', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      await createProduct(cat.id, brand.id, { slug: 'active-prod', isActive: true });
      await createProduct(cat.id, brand.id, { slug: 'inactive-prod', isActive: false });

      const res = await request(app.getHttpServer()).get('/api/products').expect(200);
      expect(res.body.total).toBe(1);
    });

    it('is publicly accessible without auth', async () => {
      await request(app.getHttpServer()).get('/api/products').expect(200);
    });
  });

  // ─── GET /api/products/:id ─────────────────────────────────────────────────

  describe('GET /api/products/:id', () => {
    it('returns product with variants and reviews', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id, { name: 'Test Product', slug: 'test-product-detail' });
      await createVariant(product.id, { size: 'M', color: 'Blue', stock: 10 });

      const res = await request(app.getHttpServer())
        .get(`/api/products/${product.id}`)
        .expect(200);

      expect(res.body).toMatchObject({ name: 'Test Product' });
      expect(res.body.variants).toHaveLength(1);
      expect(res.body.reviews).toBeDefined();
    });

    it('returns 404 for non-existent product', async () => {
      await request(app.getHttpServer()).get('/api/products/99999').expect(404);
    });
  });

  // ─── POST /api/products (admin) ───────────────────────────────────────────

  describe('POST /api/products (admin only)', () => {
    it('admin creates a product', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      await createAdminUser({ email: 'admin@test.com', password: 'Admin@123' });
      const { access_token } = await loginAs(app, 'admin@test.com', 'Admin@123');

      const res = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', bearerHeader(access_token))
        .send({
          name: 'New Product',
          slug: 'new-product-slug',
          description: 'A great product',
          brandId: brand.id,
          categoryId: cat.id,
          basePrice: 999,
          discountPct: 10,
          images: ['https://example.com/p.jpg'],
          tags: ['new', 'sale'],
        })
        .expect(201);

      expect(res.body).toMatchObject({ name: 'New Product', basePrice: 999 });
    });

    it('returns 403 for regular user', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      await createUser({ email: 'user@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'user@test.com', 'Password1!');

      await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', bearerHeader(access_token))
        .send({
          name: 'Hack Product',
          slug: 'hack-slug',
          description: 'desc',
          brandId: brand.id,
          categoryId: cat.id,
          basePrice: 100,
          images: [],
        })
        .expect(403);
    });

    it('returns 401 for unauthenticated request', async () => {
      const cat = await createCategory();
      const brand = await createBrand();

      await request(app.getHttpServer())
        .post('/api/products')
        .send({ name: 'Hack', slug: 'hack', description: 'x', brandId: brand.id, categoryId: cat.id, basePrice: 1, images: [] })
        .expect(401);
    });
  });

  // ─── PATCH /api/products/:id (admin) ─────────────────────────────────────

  describe('PATCH /api/products/:id (admin only)', () => {
    it('updates product fields', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);
      await createAdminUser({ email: 'admin2@test.com', password: 'Admin@123' });
      const { access_token } = await loginAs(app, 'admin2@test.com', 'Admin@123');

      const res = await request(app.getHttpServer())
        .patch(`/api/products/${product.id}`)
        .set('Authorization', bearerHeader(access_token))
        .send({ basePrice: 1500, discountPct: 20 })
        .expect(200);

      expect(res.body.basePrice).toBe(1500);
      expect(res.body.discountPct).toBe(20);
    });

    it('returns 404 for non-existent product', async () => {
      await createAdminUser({ email: 'admin3@test.com', password: 'Admin@123' });
      const { access_token } = await loginAs(app, 'admin3@test.com', 'Admin@123');

      await request(app.getHttpServer())
        .patch('/api/products/99999')
        .set('Authorization', bearerHeader(access_token))
        .send({ basePrice: 100 })
        .expect(404);
    });
  });

  // ─── DELETE /api/products/:id (admin) ────────────────────────────────────

  describe('DELETE /api/products/:id (admin only)', () => {
    it('deletes a product', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);
      await createAdminUser({ email: 'admin4@test.com', password: 'Admin@123' });
      const { access_token } = await loginAs(app, 'admin4@test.com', 'Admin@123');

      await request(app.getHttpServer())
        .delete(`/api/products/${product.id}`)
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      await request(app.getHttpServer()).get(`/api/products/${product.id}`).expect(404);
    });
  });

  // ─── Variant management (admin) ───────────────────────────────────────────

  describe('Variant management', () => {
    it('admin adds a variant to a product', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);
      await createAdminUser({ email: 'admin5@test.com', password: 'Admin@123' });
      const { access_token } = await loginAs(app, 'admin5@test.com', 'Admin@123');

      const res = await request(app.getHttpServer())
        .post(`/api/products/${product.id}/variants`)
        .set('Authorization', bearerHeader(access_token))
        .send({ size: 'L', color: 'Green', stock: 20, sku: `SKU-${Date.now()}` })
        .expect(201);

      expect(res.body).toMatchObject({ size: 'L', color: 'Green', stock: 20 });
    });

    it('admin updates a variant', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);
      const variant = await createVariant(product.id);
      await createAdminUser({ email: 'admin6@test.com', password: 'Admin@123' });
      const { access_token } = await loginAs(app, 'admin6@test.com', 'Admin@123');

      const res = await request(app.getHttpServer())
        .patch(`/api/products/${product.id}/variants/${variant.id}`)
        .set('Authorization', bearerHeader(access_token))
        .send({ stock: 50 })
        .expect(200);

      expect(res.body.stock).toBe(50);
    });

    it('admin deletes a variant', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product = await createProduct(cat.id, brand.id);
      const variant = await createVariant(product.id);
      await createAdminUser({ email: 'admin7@test.com', password: 'Admin@123' });
      const { access_token } = await loginAs(app, 'admin7@test.com', 'Admin@123');

      await request(app.getHttpServer())
        .delete(`/api/products/${product.id}/variants/${variant.id}`)
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      // Check variant is gone
      const variantInDb = await prisma.variant.findUnique({ where: { id: variant.id } });
      expect(variantInDb).toBeNull();
    });

    it('returns 404 updating variant that belongs to different product', async () => {
      const cat = await createCategory();
      const brand = await createBrand();
      const product1 = await createProduct(cat.id, brand.id, { slug: 'p1-var-test' });
      const product2 = await createProduct(cat.id, brand.id, { slug: 'p2-var-test' });
      const variant = await createVariant(product1.id);
      await createAdminUser({ email: 'admin8@test.com', password: 'Admin@123' });
      const { access_token } = await loginAs(app, 'admin8@test.com', 'Admin@123');

      await request(app.getHttpServer())
        .patch(`/api/products/${product2.id}/variants/${variant.id}`)
        .set('Authorization', bearerHeader(access_token))
        .send({ stock: 1 })
        .expect(404);
    });
  });
});
