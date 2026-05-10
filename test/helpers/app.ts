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

let app: INestApplication | null = null;
let moduleRef: TestingModule | null = null;

/**
 * Returns a shared NestJS test app instance. Creates it on first call.
 * Call `closeTestApp()` in afterAll to shut it down.
 */
export async function getTestApp(): Promise<INestApplication> {
  if (app) return app;

  moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    // Replace the throttler storage with a no-op so rate limiting never fires
    // in integration tests that make many rapid requests.
    // overrideGuard/overrideProvider(APP_GUARD) don't work when ThrottlerGuard
    // is registered as APP_GUARD because NestJS bypasses the class-token lookup.
    // Replacing the storage (the thing the guard reads/writes) is the reliable fix.
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
 * Closes the shared app instance. Call in afterAll.
 */
export async function closeTestApp(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
    moduleRef = null;
  }
}
