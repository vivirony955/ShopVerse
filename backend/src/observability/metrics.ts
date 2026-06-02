// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * Prometheus metrics registry — built on prom-client, kept independent
 * from the OpenTelemetry SDK so that:
 *   1. The /metrics endpoint integrates with the existing Nest HTTP
 *      server (gets BasicAuth, helmet headers, same TLS).
 *   2. Metrics work in environments without an OTLP collector (e.g.
 *      bare-metal Prometheus scraping).
 *   3. We don't fight with the not-yet-stable OTel metrics API.
 *
 * The registry is a process-global singleton (prom-client default
 * behaviour) so import order is irrelevant.
 */

import {
  Histogram,
  Counter,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

// Use a dedicated registry so collectDefaultMetrics doesn't accidentally
// double-register if some other library also touches prom-client.
export const registry = new Registry();
registry.setDefaultLabels({ service: 'shopverse-backend' });

// Process-level metrics: cpu, memory, event-loop lag, etc.
collectDefaultMetrics({ register: registry, prefix: 'shopverse_' });

/** Request duration histogram with low-cardinality labels. */
export const httpRequestDuration = new Histogram({
  name: 'shopverse_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  // route is the Express route pattern (e.g. /api/orders/:id), NOT the raw
  // URL — this keeps cardinality bounded.
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

/** Total request counter. Useful for QPS calc + error-rate ratios. */
export const httpRequestTotal = new Counter({
  name: 'shopverse_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});

/** Unhandled error counter — incremented by ErrorTrackingFilter for 5xx. */
export const httpUnhandledErrors = new Counter({
  name: 'shopverse_http_unhandled_errors_total',
  help: 'Total uncaught 5xx errors',
  labelNames: ['route'] as const,
  registers: [registry],
});

/** Cron execution counter. Incremented in tracedCron. */
export const cronExecutionTotal = new Counter({
  name: 'shopverse_cron_executions_total',
  help: 'Total cron job executions',
  labelNames: ['name', 'status'] as const,
  registers: [registry],
});

/**
 * Normalise an Express request URL into a low-cardinality route label.
 * Falls back to the raw path with numeric IDs collapsed if the route
 * pattern is unavailable (e.g. for unmatched 404s).
 */
export function routeLabel(
  routePath: string | undefined,
  fallbackUrl: string,
): string {
  if (routePath) return routePath;
  // Collapse anything that looks like an integer id into ':id'.
  // Strip query string. This is a safety net only — most Nest routes
  // expose route.path via the Express layer.
  const noQuery = fallbackUrl.split('?')[0];
  return noQuery.replace(/\/\d+(?=\/|$)/g, '/:id');
}
