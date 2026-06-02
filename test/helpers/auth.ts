// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * Helper to get a JWT token for a given user by hitting the login endpoint.
 */
import request from 'supertest';
import { INestApplication } from '@nestjs/common';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export async function loginAs(
  app: INestApplication,
  email: string,
  password: string,
): Promise<TokenPair> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);

  return {
    access_token: res.body.access_token,
    refresh_token: res.body.refresh_token,
  };
}

export function bearerHeader(token: string) {
  return `Bearer ${token}`;
}
