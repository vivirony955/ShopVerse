// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { Server } from 'http';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController (HTTP)', () => {
  let app: INestApplication;

  const mockAuthService = {
    register: jest.fn(),
    validateUser: jest.fn(),
    login: jest.fn(),
    refreshToken: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());
  afterEach(() => jest.clearAllMocks());

  // ─── POST /auth/register ─────────────────────────────────────────────────────

  describe('POST /auth/register', () => {
    it('201 — creates a new user and returns profile without password', async () => {
      const user = { id: 1, email: 'new@example.com', role: 'USER' };
      mockAuthService.register.mockResolvedValue(user);

      const res = await request(app.getHttpServer() as Server)
        .post('/auth/register')
        .send({ email: 'new@example.com', password: 'secret123' })
        .expect(201);

      expect(res.body).toEqual(user);
      expect(res.body).not.toHaveProperty('password');
    });

    it('201 — passes firstName and lastName to service', async () => {
      mockAuthService.register.mockResolvedValue({
        id: 2,
        email: 'jane@example.com',
      });

      await request(app.getHttpServer() as Server)
        .post('/auth/register')
        .send({
          email: 'jane@example.com',
          password: 'abc123',
          firstName: 'Jane',
          lastName: 'Doe',
        })
        .expect(201);

      expect(mockAuthService.register).toHaveBeenCalledWith(
        'jane@example.com',
        'abc123',
        'Jane',
        'Doe',
      );
    });

    it('409 — duplicate email returns ConflictException', async () => {
      mockAuthService.register.mockRejectedValue(
        new ConflictException('Email already in use'),
      );

      const res = await request(app.getHttpServer() as Server)
        .post('/auth/register')
        .send({ email: 'taken@example.com', password: 'pass' })
        .expect(409);

      expect((res.body as { message: string }).message).toBe(
        'Email already in use',
      );
    });
  });

  // ─── POST /auth/login ────────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('200 — returns access_token and refresh_token on valid credentials', async () => {
      mockAuthService.validateUser.mockResolvedValue({
        id: 1,
        email: 'user@example.com',
        role: 'USER',
      });
      mockAuthService.login.mockResolvedValue({
        access_token: 'at-tok',
        refresh_token: 'rt-tok',
      });

      const res = await request(app.getHttpServer() as Server)
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'pass123' })
        .expect(200);

      expect(res.body).toHaveProperty('access_token', 'at-tok');
      expect(res.body).toHaveProperty('refresh_token', 'rt-tok');
    });

    it('401 — invalid credentials return UnauthorizedException', async () => {
      mockAuthService.validateUser.mockResolvedValue(null);

      await request(app.getHttpServer() as Server)
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'wrongpass' })
        .expect(401);
    });

    it('calls validateUser then login with the validated user', async () => {
      const user = { id: 1, email: 'user@example.com', role: 'USER' };
      mockAuthService.validateUser.mockResolvedValue(user);
      mockAuthService.login.mockResolvedValue({
        access_token: 'at',
        refresh_token: 'rt',
      });

      await request(app.getHttpServer() as Server)
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'pass' })
        .expect(200);

      expect(mockAuthService.validateUser).toHaveBeenCalledWith(
        'user@example.com',
        'pass',
      );
      expect(mockAuthService.login).toHaveBeenCalledWith(user);
    });
  });

  // ─── POST /auth/refresh ───────────────────────────────────────────────────────

  describe('POST /auth/refresh', () => {
    it('200 — returns new access_token for valid refresh token', async () => {
      mockAuthService.refreshToken.mockResolvedValue({
        access_token: 'new-at',
      });

      const res = await request(app.getHttpServer() as Server)
        .post('/auth/refresh')
        .send({ refresh_token: 'valid-rt' })
        .expect(200);

      expect(res.body).toHaveProperty('access_token', 'new-at');
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith('valid-rt');
    });

    it('401 — expired or invalid refresh token', async () => {
      mockAuthService.refreshToken.mockRejectedValue(
        new UnauthorizedException('Invalid or expired refresh token'),
      );

      const res = await request(app.getHttpServer() as Server)
        .post('/auth/refresh')
        .send({ refresh_token: 'bad-token' })
        .expect(401);

      expect((res.body as { message: string }).message).toBe(
        'Invalid or expired refresh token',
      );
    });
  });
});
