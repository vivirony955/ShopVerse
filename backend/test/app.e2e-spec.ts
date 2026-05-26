import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Server } from 'http';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { ConflictException, UnauthorizedException } from '@nestjs/common';

/**
 * Smoke e2e tests using a lightweight mock app (no real DB / Stripe).
 * Each describe block creates its own scoped NestApplication so tests stay
 * independent and startup is fast.
 */
describe('Auth endpoints (e2e smoke)', () => {
  let app: INestApplication;

  const mockAuthService = {
    register: jest.fn(),
    validateUser: jest.fn(),
    login: jest.fn(),
    refreshToken: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());
  afterEach(() => jest.clearAllMocks());

  it('POST /auth/register → 201', async () => {
    mockAuthService.register.mockResolvedValue({
      id: 1,
      email: 'new@example.com',
      role: 'USER',
    });
    await request(app.getHttpServer() as Server)
      .post('/auth/register')
      .send({ email: 'new@example.com', password: 'secret123' })
      .expect(201);
  });

  it('POST /auth/register → 409 on duplicate email', async () => {
    mockAuthService.register.mockRejectedValue(
      new ConflictException('Email already in use'),
    );
    await request(app.getHttpServer() as Server)
      .post('/auth/register')
      .send({ email: 'taken@example.com', password: 'secret123' })
      .expect(409);
  });

  it('POST /auth/login → 200 with tokens', async () => {
    mockAuthService.validateUser.mockResolvedValue({
      id: 1,
      email: 'user@example.com',
      role: 'USER',
    });
    mockAuthService.login.mockResolvedValue({
      access_token: 'at',
      refresh_token: 'rt',
    });
    const res = await request(app.getHttpServer() as Server)
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'pass123' })
      .expect(200);
    expect(res.body).toHaveProperty('access_token');
    expect(res.body).toHaveProperty('refresh_token');
  });

  it('POST /auth/login → 401 on invalid credentials', async () => {
    mockAuthService.validateUser.mockResolvedValue(null);
    await request(app.getHttpServer() as Server)
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'wrong' })
      .expect(401);
  });

  it('POST /auth/refresh → 200 with new access_token', async () => {
    mockAuthService.refreshToken.mockResolvedValue({ access_token: 'new-at' });
    const res = await request(app.getHttpServer() as Server)
      .post('/auth/refresh')
      .send({ refresh_token: 'valid-rt' })
      .expect(200);
    expect(res.body).toHaveProperty('access_token');
  });

  it('POST /auth/refresh → 401 on invalid token', async () => {
    mockAuthService.refreshToken.mockRejectedValue(
      new UnauthorizedException('Invalid or expired refresh token'),
    );
    await request(app.getHttpServer() as Server)
      .post('/auth/refresh')
      .send({ refresh_token: 'bad' })
      .expect(401);
  });
});
