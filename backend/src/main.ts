// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

// ─── OBSERVABILITY INIT — MUST BE FIRST ─────────────────────────────────────
// OpenTelemetry auto-instrumentations monkey-patch http, https, prisma, and
// redis. These patches only take effect on modules required AFTER sdk.start().
// Any import above this line risks silently no-op'ing the patches.
import './observability/tracing';
import { initSentry } from './observability/sentry';
initSentry();
// ─────────────────────────────────────────────────────────────────────────────

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import basicAuth from 'express-basic-auth';
import helmet from 'helmet';
import express, { Application, Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { LoggingInterceptor } from './common/logging.interceptor';
import { ErrorTrackingFilter } from './common/error-tracking.filter';
import { ErrorTrackingService } from './common/error-tracking.service';
import { MetricsInterceptor } from './observability/metrics.interceptor';

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

  // OTel SDK shutdown is driven by SIGTERM handlers in tracing.ts.
  // Nest's own shutdown hooks ensure modules tear down cleanly first
  // (Prisma disconnects, BullMQ closes) before the SDK flush completes.
  app.enableShutdownHooks();

  const expressApp = app.getHttpAdapter().getInstance() as Application;

  // V-04: trust proxy so req.ip reflects real client IP behind Nginx
  expressApp.set('trust proxy', 1);

  // H2-02: body size limits — prevent memory exhaustion from oversized payloads.
  // Webhook route gets its own raw limit; all other routes capped at 100kb.
  expressApp.use((req: Request, res: Response, next: NextFunction) => {
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

  // ─── Global interceptors ────────────────────────────────────────────────────
  // Order matters: MetricsInterceptor must run before LoggingInterceptor so
  // it records the duration even when LoggingInterceptor errors out.
  app.useGlobalInterceptors(new MetricsInterceptor(), new LoggingInterceptor());

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

  // ─── OpenAPI / Swagger ──────────────────────────────────────────────────────
  // Off in test; open in dev; BasicAuth-gated in prod (set SWAGGER_USER +
  // SWAGGER_PASS env vars to enable, otherwise prod docs are 404).
  setupSwagger(app, expressApp);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Backend running on http://localhost:${port}/api`);
}

function setupSwagger(
  app: import('@nestjs/common').INestApplication,
  expressApp: Application,
): void {
  if (process.env.NODE_ENV === 'test') return;

  const isProd = process.env.NODE_ENV === 'production';
  const user = process.env.SWAGGER_USER;
  const pass = process.env.SWAGGER_PASS;

  // In production, docs are gated. If credentials aren't set, skip
  // setup entirely so /api/docs returns 404 rather than leaking the
  // API surface.
  if (isProd && (!user || !pass)) {
    // eslint-disable-next-line no-console
    console.log(
      '[swagger] disabled in production — set SWAGGER_USER + SWAGGER_PASS to enable',
    );
    return;
  }

  if (isProd) {
    expressApp.use(
      ['/api/docs', '/api/docs-json'],
      basicAuth({
        users: { [user!]: pass! },
        challenge: true,
        realm: 'shopverse-docs',
      }),
    );
  }

  const config = new DocumentBuilder()
    .setTitle('ShopVerse API')
    .setDescription(
      'Multi-warehouse ecommerce platform API. ' +
        'Source-available under the Elastic License 2.0. ' +
        'See https://gitlab.com/aiexperts/ecommWeb for repo + docs.',
    )
    .setVersion(process.env.npm_package_version ?? '0.1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header',
      },
      'JWT',
    )
    .addTag('Auth')
    .addTag('Users')
    .addTag('Products')
    .addTag('Cart')
    .addTag('Orders')
    .addTag('Payments')
    .addTag('Wallet')
    .addTag('Invoices')
    .addTag('Admin')
    .addTag('Observability')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    swaggerOptions: { persistAuthorization: true },
  });
  // eslint-disable-next-line no-console
  console.log(
    `[swagger] enabled — UI at /api/docs, spec at /api/docs-json${isProd ? ' (BasicAuth)' : ''}`,
  );
}

void bootstrap();
