// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

// ─── OBSERVABILITY INIT — MUST BE FIRST ─────────────────────────────────────
// Same contract as main.ts: OTel auto-instrumentations only patch modules
// loaded AFTER sdk.start(). The OTel service-name distinguishes worker
// telemetry from API telemetry via OTEL_SERVICE_NAME=shopverse-worker.
import './observability/tracing';
import { initSentry } from './observability/sentry';
initSentry();
// ─────────────────────────────────────────────────────────────────────────────

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import http from 'http';
import { WorkerModule } from './worker.module';
import { registry } from './observability/metrics';

/**
 * Worker process entrypoint.
 *
 * Runs only the BullMQ consumers and shared infrastructure (Prisma,
 * Config, Common). Does NOT bootstrap an HTTP listener for the API,
 * does NOT register controllers, does NOT enable global pipes/filters
 * (those are inbound-request concerns).
 *
 * Exposes a tiny `http.Server` on WORKER_HEALTH_PORT (default 9091)
 * serving:
 *   - GET /health  → 200 { status: 'ok' } when the Nest context is alive
 *   - GET /metrics → Prometheus text from the shared prom-client registry
 *
 * Lifecycle:
 *   - SIGTERM / SIGINT → close the Nest context (BullMQ Worker drains
 *     in-flight jobs via WorkerHost auto-lifecycle) then exit.
 *   - OTel SDK shutdown is driven by its own SIGTERM handler in
 *     observability/tracing.ts.
 */

const REQUIRED_ENV: string[] = ['DATABASE_URL'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing required env var: ${key}`);
    process.exit(1);
  }
}

async function bootstrap(): Promise<void> {
  const logger = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['log', 'error', 'warn'],
  });
  app.enableShutdownHooks();

  const healthPort = Number(process.env.WORKER_HEALTH_PORT ?? 9091);
  // http.createServer expects a sync handler — wrap the async metrics path
  // in an inner promise we fire-and-forget so the outer callback is sync.
  const healthServer = http.createServer((req, res) => {
    // Tiny router. No NestJS HTTP adapter here — we want minimal memory.
    if (req.method !== 'GET') {
      res.writeHead(405).end();
      return;
    }
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'shopverse-worker' }));
      return;
    }
    if (req.url === '/metrics') {
      void (async () => {
        try {
          const text = await registry.metrics();
          res.writeHead(200, {
            'content-type': 'text/plain; version=0.0.4; charset=utf-8',
          });
          res.end(text);
        } catch (err) {
          res.writeHead(500).end(String(err));
        }
      })();
      return;
    }
    res.writeHead(404).end();
  });

  await new Promise<void>((resolve, reject) => {
    healthServer.once('error', reject);
    healthServer.listen(healthPort, () => {
      healthServer.removeListener('error', reject);
      resolve();
    });
  });

  logger.log(
    `shopverse-worker ready — health+metrics on http://localhost:${healthPort}`,
  );

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log(`${signal} received, draining…`);
    healthServer.close();
    void app
      .close()
      .then(() => {
        logger.log('Nest context closed cleanly');
        process.exit(0);
      })
      .catch((err) => {
        logger.error(`Error during shutdown: ${String(err)}`);
        process.exit(1);
      });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void bootstrap();
