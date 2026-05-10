// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * Categories Integration Tests
 * Tests: list, get one, admin CRUD, access control.
 */
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import { cleanDatabase, createUser, createAdminUser, createCategory } from './helpers/db';
import { loginAs, bearerHeader } from './helpers/auth';

describe('Categories — Integration', () => {
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

  describe('GET /api/categories', () => {
    it('returns empty array when no categories exist', async () => {
      const res = await request(app.getHttpServer()).get('/api/categories').expect(200);
      expect(res.body).toEqual([]);
    });

    it('returns all categories', async () => {
      await createCategory({ name: 'Men', slug: 'men' });
      await createCategory({ name: 'Women', slug: 'women' });

      const res = await request(app.getHttpServer()).get('/api/categories').expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body.map((c: any) => c.slug)).toEqual(expect.arrayContaining(['men', 'women']));
    });

    it('is accessible without authentication', async () => {
      await request(app.getHttpServer()).get('/api/categories').expect(200);
    });
  });

  describe('GET /api/categories/:id', () => {
    it('returns a category by id', async () => {
      const cat = await createCategory({ name: 'Kids', slug: 'kids' });

      const res = await request(app.getHttpServer())
        .get(`/api/categories/${cat.id}`)
        .expect(200);

      expect(res.body).toMatchObject({ name: 'Kids', slug: 'kids' });
    });

    it('returns 404 for non-existent category', async () => {
      await request(app.getHttpServer()).get('/api/categories/99999').expect(404);
    });
  });

  describe('POST /api/categories (admin only)', () => {
    it('creates a category when called by admin', async () => {
      await createAdminUser({ email: 'admin@test.com', password: 'Admin@123' });
      const { access_token } = await loginAs(app, 'admin@test.com', 'Admin@123');

      const res = await request(app.getHttpServer())
        .post('/api/categories')
        .set('Authorization', bearerHeader(access_token))
        .send({ name: 'Accessories', slug: 'accessories' })
        .expect(201);

      expect(res.body).toMatchObject({ name: 'Accessories', slug: 'accessories' });
    });

    it('returns 403 when called by regular user', async () => {
      await createUser({ email: 'user@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'user@test.com', 'Password1!');

      await request(app.getHttpServer())
        .post('/api/categories')
        .set('Authorization', bearerHeader(access_token))
        .send({ name: 'Hack', slug: 'hack' })
        .expect(403);
    });

    it('returns 401 when unauthenticated', async () => {
      await request(app.getHttpServer())
        .post('/api/categories')
        .send({ name: 'Hack', slug: 'hack' })
        .expect(401);
    });
  });

  describe('PATCH /api/categories/:id (admin only)', () => {
    it('updates a category', async () => {
      const cat = await createCategory({ name: 'OldName', slug: 'old-name' });
      await createAdminUser({ email: 'admin2@test.com', password: 'Admin@123' });
      const { access_token } = await loginAs(app, 'admin2@test.com', 'Admin@123');

      const res = await request(app.getHttpServer())
        .patch(`/api/categories/${cat.id}`)
        .set('Authorization', bearerHeader(access_token))
        .send({ name: 'NewName' })
        .expect(200);

      expect(res.body.name).toBe('NewName');
    });

    it('returns 403 for regular user', async () => {
      const cat = await createCategory();
      await createUser({ email: 'notadmin@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'notadmin@test.com', 'Password1!');

      await request(app.getHttpServer())
        .patch(`/api/categories/${cat.id}`)
        .set('Authorization', bearerHeader(access_token))
        .send({ name: 'Hacked' })
        .expect(403);
    });
  });

  describe('DELETE /api/categories/:id (admin only)', () => {
    it('deletes a category', async () => {
      const cat = await createCategory({ name: 'ToDelete', slug: 'to-delete' });
      await createAdminUser({ email: 'admin3@test.com', password: 'Admin@123' });
      const { access_token } = await loginAs(app, 'admin3@test.com', 'Admin@123');

      await request(app.getHttpServer())
        .delete(`/api/categories/${cat.id}`)
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      await request(app.getHttpServer()).get(`/api/categories/${cat.id}`).expect(404);
    });
  });
});
