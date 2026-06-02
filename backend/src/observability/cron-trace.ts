// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { trace, SpanStatusCode, context } from '@opentelemetry/api';
import { cronExecutionTotal } from './metrics';

const CRON_TRACER_NAME = 'shopverse.cron';

/**
 * Wrap a @Cron handler body so each tick produces a named span.
 *
 * Without this, scheduled jobs are invisible to OTel — the
 * @nestjs/schedule decorator runs handlers outside any HTTP context,
 * so the default context is empty and no span exists.
 *
 * Usage:
 *   @Cron('0 * * * *')
 *   async runValidator() {
 *     await tracedCron('invariant-validator', () => this.actualWork());
 *   }
 *
 * Spans are always recorded (no sampling skip) since cron volume is
 * low and per-tick visibility is high-value. Errors set the span
 * status to ERROR and are re-thrown so existing retry/log paths
 * continue to work unchanged.
 */
export async function tracedCron<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer(CRON_TRACER_NAME);
  return tracer.startActiveSpan(`cron.${name}`, async (span) => {
    span.setAttribute('cron.name', name);
    span.setAttribute('sampling.priority', 1); // always record
    try {
      return await fn();
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Convenience wrapper for the common cron pattern: trace + auto-record
 * `shopverse_cron_executions_total{name,status}` with status=ok|error.
 *
 * Use this for simple crons that don't have multiple terminal states.
 * For crons with custom statuses (skipped/violations/etc), call
 * `tracedCron` directly and bump `cronExecutionTotal` yourself —
 * see InvariantValidatorService.runValidator() for an example.
 */
export async function withCronMetric<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  return tracedCron(name, async () => {
    try {
      const result = await fn();
      cronExecutionTotal.inc({ name, status: 'ok' });
      return result;
    } catch (err) {
      cronExecutionTotal.inc({ name, status: 'error' });
      throw err;
    }
  });
}

/**
 * Re-export OTel context primitives so callers don't need to import
 * @opentelemetry/api directly. Reduces accidental misuse of the global
 * tracer in non-cron code paths.
 */
export { trace, context };
