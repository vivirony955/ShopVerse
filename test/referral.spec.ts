// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import { cleanDatabase, createUser, prisma } from './helpers/db';
import { loginAs, bearerHeader } from './helpers/auth';

describe('Referral — Integration', () => {
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

  // ─── GET /api/referral/my-code ────────────────────────────────────────────

  describe('GET /api/referral/my-code', () => {
    it('REF-H01: returns a generated referral code for authenticated user', async () => {
      const user = await createUser({ email: 'referrer@test.com' });
      const { access_token } = await loginAs(app, user.email, 'Test@1234');

      const res = await request(app.getHttpServer())
        .get('/api/referral/my-code')
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      expect(res.body.referralCode).toEqual(expect.any(String));
      expect(res.body.referralCode.length).toBeGreaterThan(0);
      expect(res.body.referralCount).toEqual(expect.any(Number));
    });

    it('REF-H02: calling my-code twice returns the same code (idempotent)', async () => {
      const user = await createUser({ email: 'referrer@test.com' });
      const { access_token } = await loginAs(app, user.email, 'Test@1234');

      const first = await request(app.getHttpServer())
        .get('/api/referral/my-code')
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      const second = await request(app.getHttpServer())
        .get('/api/referral/my-code')
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      expect(first.body.referralCode).toBe(second.body.referralCode);
    });

    it('REF-A01: 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/api/referral/my-code')
        .expect(401);
    });
  });

  // ─── POST /api/referral/apply ─────────────────────────────────────────────

  describe('POST /api/referral/apply', () => {
    it('REF-H03: referee successfully applies a referral code', async () => {
      const referrer = await createUser({ email: 'referrer@test.com' });
      const referee = await createUser({ email: 'referee@test.com' });

      // Referrer gets their code
      const { access_token: refToken } = await loginAs(app, referrer.email, 'Test@1234');
      const codeRes = await request(app.getHttpServer())
        .get('/api/referral/my-code')
        .set('Authorization', bearerHeader(refToken))
        .expect(200);

      const code = codeRes.body.referralCode;

      // Referee applies it
      const { access_token: eeToken } = await loginAs(app, referee.email, 'Test@1234');
      const applyRes = await request(app.getHttpServer())
        .post('/api/referral/apply')
        .set('Authorization', bearerHeader(eeToken))
        .send({ code })
        .expect(200);

      expect(applyRes.body.message).toEqual(expect.any(String));
      expect(applyRes.body.bonusPoints).toBeGreaterThanOrEqual(0);

      // ReferralCredit row must exist
      const credit = await prisma.referralCredit.findUnique({ where: { newUserId: referee.id } });
      expect(credit).not.toBeNull();
      expect(credit?.referrerId).toBe(referrer.id);
    });

    it('REF-E01: self-referral is blocked', async () => {
      const user = await createUser({ email: 'user@test.com' });
      const { access_token } = await loginAs(app, user.email, 'Test@1234');

      // User fetches their own code
      const codeRes = await request(app.getHttpServer())
        .get('/api/referral/my-code')
        .set('Authorization', bearerHeader(access_token))
        .expect(200);

      const ownCode = codeRes.body.referralCode;

      // User tries to apply their own code
      const res = await request(app.getHttpServer())
        .post('/api/referral/apply')
        .set('Authorization', bearerHeader(access_token))
        .send({ code: ownCode })
        .expect(400);

      expect(res.body.message).toBeDefined();
    });

    it('REF-E02: non-existent referral code returns error', async () => {
      const user = await createUser({ email: 'user@test.com' });
      const { access_token } = await loginAs(app, user.email, 'Test@1234');

      await request(app.getHttpServer())
        .post('/api/referral/apply')
        .set('Authorization', bearerHeader(access_token))
        .send({ code: 'SV-INVALID-CODE' })
        .expect((res) => {
          expect([400, 404]).toContain(res.status);
        });
    });

    it('REF-E03: applying a referral code twice is rejected (newUserId unique)', async () => {
      const referrer = await createUser({ email: 'referrer@test.com' });
      const referee = await createUser({ email: 'referee@test.com' });

      const { access_token: refToken } = await loginAs(app, referrer.email, 'Test@1234');
      const codeRes = await request(app.getHttpServer())
        .get('/api/referral/my-code')
        .set('Authorization', bearerHeader(refToken))
        .expect(200);
      const code = codeRes.body.referralCode;

      const { access_token: eeToken } = await loginAs(app, referee.email, 'Test@1234');

      // First apply succeeds
      await request(app.getHttpServer())
        .post('/api/referral/apply')
        .set('Authorization', bearerHeader(eeToken))
        .send({ code })
        .expect(200);

      // Second apply is rejected
      await request(app.getHttpServer())
        .post('/api/referral/apply')
        .set('Authorization', bearerHeader(eeToken))
        .send({ code })
        .expect((res) => {
          expect([400, 409]).toContain(res.status);
        });
    });

    it('REF-H04: referralCount increments after a successful apply', async () => {
      const referrer = await createUser({ email: 'referrer@test.com' });
      const referee = await createUser({ email: 'referee@test.com' });

      const { access_token: refToken } = await loginAs(app, referrer.email, 'Test@1234');
      const codeRes = await request(app.getHttpServer())
        .get('/api/referral/my-code')
        .set('Authorization', bearerHeader(refToken))
        .expect(200);
      const code = codeRes.body.referralCode;
      const countBefore = codeRes.body.referralCount as number;

      const { access_token: eeToken } = await loginAs(app, referee.email, 'Test@1234');
      await request(app.getHttpServer())
        .post('/api/referral/apply')
        .set('Authorization', bearerHeader(eeToken))
        .send({ code })
        .expect(200);

      const afterRes = await request(app.getHttpServer())
        .get('/api/referral/my-code')
        .set('Authorization', bearerHeader(refToken))
        .expect(200);

      expect(afterRes.body.referralCount).toBe(countBefore + 1);
    });

    it('REF-A02: 401 without token', async () => {
      await request(app.getHttpServer())
        .post('/api/referral/apply')
        .send({ code: 'SV-TEST-1234' })
        .expect(401);
    });
  });
});
