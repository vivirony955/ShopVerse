// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import express from 'express';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { LoggingInterceptor } from './common/logging.interceptor';
import { ErrorTrackingFilter } from './common/error-tracking.filter';
import { ErrorTrackingService } from './common/error-tracking.service';

// H2-04: All required env vars must be present at startup.
// Fail fast rather than silently misbehaving in production.
const REQUIRED_ENV: string[] = [
  'JWT_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'DATABASE_URL',
];
// CORS_ORIGIN required only in production (dev defaults to localhost)
if (process.env.NODE_ENV === 'production') {
  REQUIRED_ENV.push('CORS_ORIGIN');
}
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(
      `FATAL: Missing required env var: ${key}. App cannot start safely.`,
    );
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Required for Stripe webhook signature verification
    logger: ['log', 'error', 'warn'],
  });

  const expressApp = app.getHttpAdapter().getInstance();

  // V-04: trust proxy so req.ip reflects real client IP behind Nginx
  expressApp.set('trust proxy', 1);

  // H2-02: body size limits — prevent memory exhaustion from oversized payloads.
  // Webhook route gets its own raw limit; all other routes capped at 100kb.
  expressApp.use((req: any, res: any, next: any) => {
    if (req.path === '/api/payments/webhook') return next();
    express.json({ limit: '100kb' })(req, res, next);
  });

  // ─── Security headers ────────────────────────────────────────────────────────
  // V-07: no unsafe-inline in scriptSrc.
  // H2-11: full CSP — frameAncestors, objectSrc, baseUri, formAction added.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'js.stripe.com'],
          frameSrc: ["'self'", 'js.stripe.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'api.stripe.com'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"], // prevents clickjacking
          upgradeInsecureRequests: [],
        },
      },
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginEmbedderPolicy: false, // Stripe requires disabled
    }),
  );

  // ─── Global validation pipe ─────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ─── Global filters ─────────────────────────────────────────────────────────
  app.useGlobalFilters(new PrismaExceptionFilter());
  const errorTracking = app.get(ErrorTrackingService);
  app.useGlobalFilters(new ErrorTrackingFilter(errorTracking));

  // ─── Structured logging ──────────────────────────────────────────────────────
  app.useGlobalInterceptors(new LoggingInterceptor());

  // ─── CORS ────────────────────────────────────────────────────────────────────
  // H2-03: wildcard CORS rejected; CORS_ORIGIN required in production.
  const rawOrigins = process.env.CORS_ORIGIN;
  if (rawOrigins?.includes('*') && process.env.NODE_ENV === 'production') {
    throw new Error('SECURITY: CORS_ORIGIN=* is not permitted in production');
  }
  const allowedOrigins = rawOrigins
    ? rawOrigins.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'http://localhost:5173'];

  app.enableCors({ origin: allowedOrigins, credentials: true });

  app.setGlobalPrefix('api');

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`Backend running on http://localhost:${port}/api`);
}
void bootstrap();
