/**
 * Auth Integration Tests
 * Tests: register, login, refresh token, duplicate email, invalid credentials,
 *        protected routes (no token / bad token), and token contents.
 */
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import { cleanDatabase, createUser } from './helpers/db';

describe('Auth — Integration', () => {
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

  // ─── Register ─────────────────────────────────────────────────────────────

  describe('POST /api/auth/register', () => {
    it('creates a new user and returns user data without password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'alice@test.com',
          password: 'Password1!',
          firstName: 'Alice',
          lastName: 'Smith',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        email: 'alice@test.com',
        firstName: 'Alice',
        lastName: 'Smith',
        role: 'USER',
      });
      expect(res.body.password).toBeUndefined();
      expect(res.body.id).toEqual(expect.any(Number));
    });

    it('returns 409 when email is already registered', async () => {
      await createUser({ email: 'dup@test.com', password: 'Password1!' });

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'dup@test.com', password: 'Password1!' })
        .expect(409);
    });

    it('returns 400 when email is invalid', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'Password1!' })
        .expect(400);
    });

    it('returns 400 when password is shorter than 8 characters', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'short@test.com', password: 'abc' })
        .expect(400);
    });

    it('returns 400 when email is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ password: 'Password1!' })
        .expect(400);
    });

    it('returns 400 when password is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'missing@test.com' })
        .expect(400);
    });

    it('registers without optional firstName/lastName', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'noname@test.com', password: 'Password1!' })
        .expect(201);

      expect(res.body.email).toBe('noname@test.com');
      expect(res.body.firstName).toBeNull();
    });

    it('returns 400 when extra unknown fields are sent', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'extra@test.com', password: 'Password1!', adminKey: 'hack' })
        .expect(400);
    });
  });

  // ─── Login ────────────────────────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await createUser({ email: 'bob@test.com', password: 'Password1!' });
    });

    it('returns access_token and refresh_token on valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'bob@test.com', password: 'Password1!' })
        .expect(200);

      expect(res.body.access_token).toEqual(expect.any(String));
      expect(res.body.refresh_token).toEqual(expect.any(String));
    });

    it('returns 401 on wrong password', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'bob@test.com', password: 'WrongPassword!' })
        .expect(401);
    });

    it('returns 401 for non-existent email', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'ghost@test.com', password: 'Password1!' })
        .expect(401);
    });

    it('returns 400 when email is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ password: 'Password1!' })
        .expect(400);
    });

    it('returns tokens that are valid JWTs (three dot-separated parts)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'bob@test.com', password: 'Password1!' })
        .expect(200);

      const { access_token, refresh_token } = res.body;
      expect(access_token.split('.')).toHaveLength(3);
      expect(refresh_token.split('.')).toHaveLength(3);
    });
  });

  // ─── Refresh token ────────────────────────────────────────────────────────

  describe('POST /api/auth/refresh', () => {
    it('returns a new access_token given a valid refresh_token', async () => {
      await createUser({ email: 'refresh@test.com', password: 'Password1!' });

      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'refresh@test.com', password: 'Password1!' });

      const { refresh_token } = loginRes.body;

      const refreshRes = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token })
        .expect(200);

      // A valid JWT has three dot-separated parts
      expect(refreshRes.body.access_token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    });

    it('returns 401 given an invalid refresh_token', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token: 'not.a.valid.token' })
        .expect(401);
    });

    it('returns 400 when refresh_token is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({})
        .expect(400);
    });
  });

  // ─── Protected route access ───────────────────────────────────────────────

  describe('Protected routes', () => {
    it('returns 401 when accessing a protected route without a token', async () => {
      await request(app.getHttpServer())
        .get('/api/users/me')
        .expect(401);
    });

    it('returns 401 when Authorization header has a malformed token', async () => {
      await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(401);
    });

    it('allows access to a protected route with a valid token', async () => {
      await createUser({ email: 'valid@test.com', password: 'Password1!' });

      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'valid@test.com', password: 'Password1!' });

      const { access_token } = loginRes.body;

      await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);
    });
  });
});
