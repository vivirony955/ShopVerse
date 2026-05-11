// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * Creates a fully-bootstrapped NestJS application for integration testing.
 * Mirrors the same setup as main.ts (pipes, filters, prefix).
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getStorageToken } from '@nestjs/throttler';
import { AppModule } from '../../backend/src/app.module';
import { PrismaExceptionFilter } from '../../backend/src/common/filters/prisma-exception.filter';

/** No-op ThrottlerStorage: always returns 0 hits so the guard never throttles. */
const noopStorage = {
  increment: async () => ({ totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 }),
};

// Module-level singleton: one NestJS app per spec file.
// Jest resets this module per spec (--runInBand module isolation), so each
// spec gets a fresh app. closeTestApp() must be called in afterAll to free
// the NestJS PrismaService connection pool (3 connections) before the next
// spec creates its own app.
let app: INestApplication | null = null;
let moduleRef: TestingModule | null = null;

/**
 * Returns a shared NestJS test app instance (per spec file). Creates it on first call.
 * Call `closeTestApp()` in afterAll to release the connection pool.
 */
export async function getTestApp(): Promise<INestApplication> {
  if (app) return app;

  moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    // Replace the throttler storage with a no-op so rate limiting never fires
    // in integration tests that make many rapid requests.
    .overrideProvider(getStorageToken())
    .useValue(noopStorage)
    .compile();

  app = moduleRef.createNestApplication({ rawBody: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new PrismaExceptionFilter());
  app.setGlobalPrefix('api');

  await app.init();
  return app;
}

/**
 * Closes the NestJS app, releasing its PrismaService connection pool.
 * Must be called in afterAll for every spec that calls getTestApp().
 */
export async function closeTestApp(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
    moduleRef = null;
  }
}
