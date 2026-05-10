/**
 * Brands Integration Tests
 * Tests: list, get one, admin CRUD, access control.
 */
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import { cleanDatabase, createUser, createAdminUser, createBrand } from './helpers/db';
import { loginAs, bearerHeader } from './helpers/auth';

describe('Brands — Integration', () => {
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

  describe('GET /api/brands', () => {
    it('returns empty array when no brands exist', async () => {
      const res = await request(app.getHttpServer()).get('/api/brands').expect(200);
      expect(res.body).toEqual([]);
    });

    it('returns all brands', async () => {
      await createBrand({ name: 'Nike', slug: 'nike' });
      await createBrand({ name: 'Adidas', slug: 'adidas' });

      const res = await request(app.getHttpServer()).get('/api/brands').expect(200);
      expect(res.body).toHaveLength(2);
    });

    it('is publicly accessible', async () => {
      await request(app.getHttpServer()).get('/api/brands').expect(200);
    });
  });

  describe('GET /api/brands/:id', () => {
    it('returns a brand by id', async () => {
      const brand = await createBrand({ name: 'Puma', slug: 'puma' });

      const res = await request(app.getHttpServer())
        .get(`/api/brands/${brand.id}`)
        .expect(200);

      expect(res.body).toMatchObject({ name: 'Puma', slug: 'puma' });
    });

    it('returns 404 for non-existent brand', async () => {
      await request(app.getHttpServer()).get('/api/brands/99999').expect(404);
    });
  });

  describe('POST /api/brands (admin only)', () => {
    it('admin creates a brand', async () => {
      await createAdminUser({ email: 'admin@test.com', password: 'Admin@123' });
      const { access_token } = await loginAs(app, 'admin@test.com', 'Admin@123');

      const res = await request(app.getHttpServer())
        .post('/api/brands')
        .set('Authorization', bearerHeader(access_token))
        .send({ name: 'Reebok', slug: 'reebok' })
        .expect(201);

      expect(res.body).toMatchObject({ name: 'Reebok', slug: 'reebok' });
    });

    it('returns 403 for regular user', async () => {
      await createUser({ email: 'user@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'user@test.com', 'Password1!');

      await request(app.getHttpServer())
        .post('/api/brands')
        .set('Authorization', bearerHeader(access_token))
        .send({ name: 'Hack', slug: 'hack' })
        .expect(403);
    });

    it('returns 401 for unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post('/api/brands')
        .send({ name: 'Hack', slug: 'hack' })
        .expect(401);
    });
  });

  describe('PATCH /api/brands/:id (admin only)', () => {
    it('updates a brand', async () => {
      const brand = await createBrand({ name: 'OldBrand', slug: 'old-brand' });
      await createAdminUser({ email: 'admin2@test.com', password: 'Admin@123' });
      const { access_token } = await loginAs(app, 'admin2@test.com', 'Admin@123');

      const res = await request(app.getHttpServer())
        .patch(`/api/brands/${brand.id}`)
        .set('Authorization', bearerHeader(access_token))
        .send({ name: 'NewBrand' })
        .expect(200);

      expect(res.body.name).toBe('NewBrand');
    });
  });

  describe('DELETE /api/brands/:id (admin only)', () => {
    it('deletes a brand', async () => {
      const brand = await createBrand({ name: 'ToDelete', slug: 'to-delete-brand' });
      await createAdminUser({ email: 'admin3@test.com', password: 'Admin@123' });
      const { access_token } = await loginAs(app, 'admin3@test.com', 'Admin@123');

      await request(app.getHttpServer())
        .delete(`/api/brands/${brand.id}`)
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      await request(app.getHttpServer()).get(`/api/brands/${brand.id}`).expect(404);
    });
  });
});
