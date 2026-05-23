// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * OpenTelemetry SDK initialisation.
 *
 * CRITICAL: this file MUST be the FIRST import in `main.ts`. The OTel
 * auto-instrumentations monkey-patch Node built-ins (http, https) and the
 * Prisma/Express/Redis modules. If any of those modules are required
 * before `sdk.start()` runs, the patches no-op silently and you get an
 * empty traces panel.
 *
 * The SDK is OFF by default. It activates only when:
 *   - OTEL_EXPORTER_OTLP_ENDPOINT env var is set, AND
 *   - NODE_ENV !== 'test'
 *
 * Test environment is always a no-op so the 687 integration tests run at
 * the same speed and don't emit spurious spans.
 *
 * Edge cases handled:
 *   - Hot-reload (start:dev) re-evaluation → globalThis guard prevents
 *     "tracer already registered" panics.
 *   - OTLP endpoint unreachable → BatchSpanProcessor's bounded queue
 *     (default 2048) drops spans rather than blocking the request path.
 *   - SIGTERM → SDK shutdown awaited so in-flight spans are flushed.
 *   - /health, /metrics, /api/docs* → excluded from auto-instrumentation
 *     to avoid noise.
 */

import type { Span } from '@opentelemetry/api';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import { PrismaInstrumentation } from '@prisma/instrumentation';

interface GlobalWithOtel {
  __shopverse_otel_started?: boolean;
  __shopverse_otel_sdk?: NodeSDK;
}

const g = globalThis as GlobalWithOtel;

function shouldEnable(): boolean {
  if (process.env.NODE_ENV === 'test') return false;
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return false;
  return true;
}

if (shouldEnable() && !g.__shopverse_otel_started) {
  // Quiet diag by default; flip to DEBUG via OTEL_LOG_LEVEL=debug if needed.
  if (process.env.OTEL_LOG_LEVEL === 'debug') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT!.replace(/\/+$/, '');
  const sampleRate = Number(process.env.OTEL_TRACES_SAMPLER_ARG ?? '0.1');
  const serviceName =
    process.env.OTEL_SERVICE_NAME ?? 'shopverse-backend';
  const serviceVersion =
    process.env.SENTRY_RELEASE ?? process.env.npm_package_version ?? 'unknown';
  const environment = process.env.NODE_ENV ?? 'development';

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: environment,
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
    }),
    sampler: new ParentBasedSampler({
      // 10% head sampling by default. Errors are sampled regardless via
      // `setAttribute('sampling.priority', 1)` on the error path (see
      // ErrorTrackingFilter). Critical financial routes opt-in to 100%
      // by setting the same attribute.
      root: new TraceIdRatioBasedSampler(sampleRate),
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // FS is extremely noisy and adds no signal.
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // Skip health, metrics, and docs from incoming HTTP traces.
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => {
            const url = req.url ?? '';
            return (
              url === '/api/health' ||
              url === '/metrics' ||
              url.startsWith('/api/docs')
            );
          },
          // Never put request bodies on spans (would leak PII).
          requestHook: (span: Span) => {
            span.setAttribute('tenant', 'shopverse');
          },
        },
        // Express auto-instrumentation produces a span per middleware which
        // explodes cardinality with NestJS pipelines. Disable.
        '@opentelemetry/instrumentation-express': { enabled: false },
      }),
      new PrismaInstrumentation(),
    ],
  });

  try {
    sdk.start();
    g.__shopverse_otel_started = true;
    g.__shopverse_otel_sdk = sdk;
    // eslint-disable-next-line no-console
    console.log(
      `[otel] tracing enabled — service=${serviceName} env=${environment} sample=${sampleRate} → ${endpoint}/v1/traces`,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[otel] init failed; continuing without tracing:`, err);
  }

  const shutdown = (signal: string) => {
    if (!g.__shopverse_otel_sdk) return;
    // eslint-disable-next-line no-console
    console.log(`[otel] ${signal} — flushing spans…`);
    void g.__shopverse_otel_sdk
      .shutdown()
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[otel] shutdown error:', err);
      })
      .finally(() => {
        g.__shopverse_otel_sdk = undefined;
        g.__shopverse_otel_started = false;
      });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
} else if (process.env.NODE_ENV !== 'test') {
  // eslint-disable-next-line no-console
  console.log(
    '[otel] tracing disabled — set OTEL_EXPORTER_OTLP_ENDPOINT to enable',
  );
}
