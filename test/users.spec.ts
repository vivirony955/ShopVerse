/**
 * Users Integration Tests
 * Tests: get profile, update profile, address CRUD, set default address,
 *        access control (own data only).
 */
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import { cleanDatabase, createUser, createAddress } from './helpers/db';
import { loginAs, bearerHeader } from './helpers/auth';

describe('Users — Integration', () => {
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

  // ─── GET /users/me ─────────────────────────────────────────────────────────

  describe('GET /api/users/me', () => {
    it('returns current user profile', async () => {
      await createUser({ email: 'me@test.com', password: 'Password1!', firstName: 'Alice' });
      const { access_token } = await loginAs(app, 'me@test.com', 'Password1!');

      const res = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      expect(res.body).toMatchObject({
        email: 'me@test.com',
        firstName: 'Alice',
        role: 'USER',
      });
      expect(res.body.password).toBeUndefined();
    });

    it('returns 401 without token', async () => {
      await request(app.getHttpServer()).get('/api/users/me').expect(401);
    });
  });

  // ─── PATCH /users/me ───────────────────────────────────────────────────────

  describe('PATCH /api/users/me', () => {
    it('updates firstName, lastName and phone', async () => {
      await createUser({ email: 'update@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'update@test.com', 'Password1!');

      const res = await request(app.getHttpServer())
        .patch('/api/users/me')
        .set('Authorization', bearerHeader(access_token))
        .send({ firstName: 'Updated', lastName: 'Name', phone: '9876543210' })
        .expect(200);

      expect(res.body).toMatchObject({
        firstName: 'Updated',
        lastName: 'Name',
        phone: '9876543210',
      });
    });

    it('returns 400 for unknown fields (forbidNonWhitelisted)', async () => {
      await createUser({ email: 'badfield@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'badfield@test.com', 'Password1!');

      await request(app.getHttpServer())
        .patch('/api/users/me')
        .set('Authorization', bearerHeader(access_token))
        .send({ role: 'ADMIN' })
        .expect(400);
    });

    it('allows partial update (only firstName)', async () => {
      await createUser({ email: 'partial@test.com', password: 'Password1!', lastName: 'Smith' });
      const { access_token } = await loginAs(app, 'partial@test.com', 'Password1!');

      const res = await request(app.getHttpServer())
        .patch('/api/users/me')
        .set('Authorization', bearerHeader(access_token))
        .send({ firstName: 'OnlyFirst' })
        .expect(200);

      expect(res.body.firstName).toBe('OnlyFirst');
      expect(res.body.lastName).toBe('Smith');
    });
  });

  // ─── Address CRUD ──────────────────────────────────────────────────────────

  describe('GET /api/users/me/addresses', () => {
    it('returns empty array when user has no addresses', async () => {
      await createUser({ email: 'noaddr@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'noaddr@test.com', 'Password1!');

      const res = await request(app.getHttpServer())
        .get('/api/users/me/addresses')
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('returns list of addresses', async () => {
      const user = await createUser({ email: 'addr@test.com', password: 'Password1!' });
      await createAddress(user.id);
      const { access_token } = await loginAs(app, 'addr@test.com', 'Password1!');

      const res = await request(app.getHttpServer())
        .get('/api/users/me/addresses')
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ city: 'Mumbai' });
    });
  });

  describe('POST /api/users/me/addresses', () => {
    it('creates a new address', async () => {
      await createUser({ email: 'addaddr@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'addaddr@test.com', 'Password1!');

      const res = await request(app.getHttpServer())
        .post('/api/users/me/addresses')
        .set('Authorization', bearerHeader(access_token))
        .send({
          fullName: 'John Doe',
          phone: '9876543210',
          line1: '456 Park Avenue',
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110001',
          isDefault: true,
        })
        .expect(201);

      expect(res.body).toMatchObject({ city: 'Delhi', isDefault: true });
    });

    it('returns 400 when required fields are missing', async () => {
      await createUser({ email: 'missingfields@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'missingfields@test.com', 'Password1!');

      await request(app.getHttpServer())
        .post('/api/users/me/addresses')
        .set('Authorization', bearerHeader(access_token))
        .send({ city: 'Delhi' })
        .expect(400);
    });

    it('setting isDefault=true clears previous default', async () => {
      const user = await createUser({ email: 'defaddr@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'defaddr@test.com', 'Password1!');

      // Create first address as default
      await request(app.getHttpServer())
        .post('/api/users/me/addresses')
        .set('Authorization', bearerHeader(access_token))
        .send({
          fullName: 'First',
          phone: '9999999999',
          line1: 'Line1',
          city: 'Mumbai',
          state: 'MH',
          pincode: '400001',
          isDefault: true,
        });

      // Create second address as default — should demote first
      await request(app.getHttpServer())
        .post('/api/users/me/addresses')
        .set('Authorization', bearerHeader(access_token))
        .send({
          fullName: 'Second',
          phone: '8888888888',
          line1: 'Line2',
          city: 'Pune',
          state: 'MH',
          pincode: '411001',
          isDefault: true,
        });

      const listRes = await request(app.getHttpServer())
        .get('/api/users/me/addresses')
        .set('Authorization', bearerHeader(access_token));

      const defaults = listRes.body.filter((a: any) => a.isDefault);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].city).toBe('Pune');
    });
  });

  describe('PATCH /api/users/me/addresses/:id', () => {
    it('updates an address', async () => {
      const user = await createUser({ email: 'updaddr@test.com', password: 'Password1!' });
      const addr = await createAddress(user.id);
      const { access_token } = await loginAs(app, 'updaddr@test.com', 'Password1!');

      const res = await request(app.getHttpServer())
        .patch(`/api/users/me/addresses/${addr.id}`)
        .set('Authorization', bearerHeader(access_token))
        .send({ city: 'Bangalore' })
        .expect(200);

      expect(res.body.city).toBe('Bangalore');
    });

    it('returns 404 when address belongs to another user', async () => {
      const user1 = await createUser({ email: 'u1@test.com', password: 'Password1!' });
      const user2 = await createUser({ email: 'u2@test.com', password: 'Password1!' });
      const addr = await createAddress(user1.id);
      const { access_token } = await loginAs(app, 'u2@test.com', 'Password1!');

      await request(app.getHttpServer())
        .patch(`/api/users/me/addresses/${addr.id}`)
        .set('Authorization', bearerHeader(access_token))
        .send({ city: 'Hacked' })
        .expect(404);
    });
  });

  describe('DELETE /api/users/me/addresses/:id', () => {
    it('deletes own address', async () => {
      const user = await createUser({ email: 'deladdr@test.com', password: 'Password1!' });
      const addr = await createAddress(user.id);
      const { access_token } = await loginAs(app, 'deladdr@test.com', 'Password1!');

      await request(app.getHttpServer())
        .delete(`/api/users/me/addresses/${addr.id}`)
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      const listRes = await request(app.getHttpServer())
        .get('/api/users/me/addresses')
        .set('Authorization', bearerHeader(access_token));

      expect(listRes.body).toHaveLength(0);
    });

    it('returns 404 when trying to delete another user\'s address', async () => {
      const user1 = await createUser({ email: 'own1@test.com', password: 'Password1!' });
      const user2 = await createUser({ email: 'own2@test.com', password: 'Password1!' });
      const addr = await createAddress(user1.id);
      const { access_token } = await loginAs(app, 'own2@test.com', 'Password1!');

      await request(app.getHttpServer())
        .delete(`/api/users/me/addresses/${addr.id}`)
        .set('Authorization', bearerHeader(access_token))
        .expect(404);
    });
  });

  describe('PATCH /api/users/me/addresses/:id/default', () => {
    it('sets an address as default and demotes others', async () => {
      const user = await createUser({ email: 'setdef@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'setdef@test.com', 'Password1!');

      // Create two addresses
      const a1 = await request(app.getHttpServer())
        .post('/api/users/me/addresses')
        .set('Authorization', bearerHeader(access_token))
        .send({ fullName: 'A1', phone: '1111111111', line1: 'L1', city: 'C1', state: 'S1', pincode: '100001' });

      const a2 = await request(app.getHttpServer())
        .post('/api/users/me/addresses')
        .set('Authorization', bearerHeader(access_token))
        .send({ fullName: 'A2', phone: '2222222222', line1: 'L2', city: 'C2', state: 'S2', pincode: '200002' });

      // Set second as default
      await request(app.getHttpServer())
        .patch(`/api/users/me/addresses/${a2.body.id}/default`)
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      const listRes = await request(app.getHttpServer())
        .get('/api/users/me/addresses')
        .set('Authorization', bearerHeader(access_token));

      const defaultAddr = listRes.body.find((a: any) => a.isDefault);
      expect(defaultAddr.id).toBe(a2.body.id);
    });
  });
});
