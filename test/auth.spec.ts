// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * Auth Integration Tests
 * Tests: register, login, refresh token, duplicate email, invalid credentials,
 *        protected routes (no token / bad token), and token contents.
 */
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import { cleanDatabase, createUser, prisma } from './helpers/db';

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

  // ─── Account lockout (SEC) ────────────────────────────────────────────────

  describe('Account lockout (SEC)', () => {
    it('SEC-H01: 5th wrong password triggers lockout — subsequent attempt rejected', async () => {
      await createUser({ email: 'lock@test.com', password: 'Password1!' });

      // Pre-fill 4 failures in DB so next wrong attempt is the 5th (threshold)
      await prisma.user.update({
        where: { email: 'lock@test.com' },
        data: { failedLoginAttempts: 4 },
      });

      // 5th wrong attempt — increments counter to 5, sets lockedUntil
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'lock@test.com', password: 'WRONG_PASSWORD!' })
        .expect(401);

      // Next attempt (correct password) is now blocked by the lock
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'lock@test.com', password: 'Password1!' })
        .expect(400);

      expect(JSON.stringify(res.body)).toMatch(/lock/i);
    });

    it('SEC-H02: locked account rejects correct password while lockedUntil is in the future', async () => {
      await createUser({ email: 'locked@test.com', password: 'Password1!' });

      await prisma.user.update({
        where: { email: 'locked@test.com' },
        data: {
          failedLoginAttempts: 5,
          lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'locked@test.com', password: 'Password1!' })
        .expect(400);

      expect(JSON.stringify(res.body)).toMatch(/lock/i);
    });

    it('SEC-H03: login succeeds once lockedUntil has elapsed', async () => {
      await createUser({ email: 'unlocked@test.com', password: 'Password1!' });

      await prisma.user.update({
        where: { email: 'unlocked@test.com' },
        data: {
          failedLoginAttempts: 5,
          lockedUntil: new Date(Date.now() - 1000), // 1 second in the past
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'unlocked@test.com', password: 'Password1!' })
        .expect(200);

      expect(res.body.access_token).toEqual(expect.any(String));
    });
  });

  // ─── Token version revocation (SEC) ──────────────────────────────────────

  describe('Token version revocation', () => {
    it('SEC-H04: old refresh_token is rejected after tokenVersion is incremented', async () => {
      await createUser({ email: 'tokenver@test.com', password: 'Password1!' });

      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'tokenver@test.com', password: 'Password1!' })
        .expect(200);

      const { refresh_token } = loginRes.body;

      // Simulate password change by incrementing tokenVersion (invalidates all prior refresh tokens)
      await prisma.user.update({
        where: { email: 'tokenver@test.com' },
        data: { tokenVersion: { increment: 1 } },
      });

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token })
        .expect(401);
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
