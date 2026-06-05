// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { Server } from 'http';
import {
  AuthController,
  AUTH_THROTTLE,
  positiveIntEnv,
} from './auth.controller';
import { AuthService } from './auth.service';

describe('auth throttle (G-2 / G-7)', () => {
  describe('positiveIntEnv (limit parse guard)', () => {
    const KEY = 'AUTH_THROTTLE_TEST_VAR';
    afterEach(() => delete process.env[KEY]);

    it.each([
      ['unset', undefined, 5],
      ['0', '0', 5],
      ['negative', '-1', 5],
      ['non-numeric', 'abc', 5],
      ['float', '2.5', 5],
      ['valid', '10', 10],
    ])('%s -> %s', (_label, value, expected) => {
      if (value === undefined) delete process.env[KEY];
      else process.env[KEY] = value;
      expect(positiveIntEnv(KEY, 5)).toBe(expected);
    });
  });

  describe('POST /auth/login enforces the configured per-IP limit', () => {
    let app: INestApplication;
    const limit = AUTH_THROTTLE.default.limit;

    const mockAuthService = {
      // Always reject creds so each allowed request is a clean 401 (not a 500).
      validateUser: jest.fn().mockResolvedValue(null),
      login: jest.fn(),
      register: jest.fn(),
      refreshToken: jest.fn(),
    };

    beforeAll(async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        // Default global throttler is generous; the controller's @Throttle on
        // /auth/login is the strict one under test. In-memory storage (no Redis).
        imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
        controllers: [AuthController],
        providers: [
          { provide: AuthService, useValue: mockAuthService },
          { provide: APP_GUARD, useClass: ThrottlerGuard },
        ],
      }).compile();
      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterAll(() => app.close());

    it(`allows ${AUTH_THROTTLE.default.limit} attempts then 429s the next`, async () => {
      const server = app.getHttpServer() as Server;
      const body = { email: 'nobody@example.com', password: 'wrong-pass' };

      for (let i = 0; i < limit; i++) {
        await request(server).post('/auth/login').send(body).expect(401);
      }
      // The (limit + 1)th within the window is rate-limited.
      await request(server).post('/auth/login').send(body).expect(429);
    });
  });
});
