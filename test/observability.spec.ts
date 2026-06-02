// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * A2 observability stack tests.
 *
 * Covers:
 *   - PII scrubber (unit) — emails, phones, card-like digits, field-name
 *     redaction (recursive), cycle safety, primitives pass-through.
 *   - `/api/metrics` endpoint (integration) — Prometheus text format,
 *     expected metric series present, registry working, default process
 *     metrics included.
 *   - `withCronMetric` helper (unit) — bumps Prometheus counter on ok/error.
 *
 * Not covered here (out of scope for the test bootstrap):
 *   - `/api/docs` Swagger UI — disabled in NODE_ENV=test by main.ts.
 *   - OTel span emission — requires an OTLP exporter; the SDK is also
 *     disabled in test env (no spans recorded → nothing to assert).
 *   - Sentry capture path — no SENTRY_DSN in test env → init returns early.
 *   - Log trace_id correlation — LoggingInterceptor isn't applied by the
 *     test bootstrap (only main.ts wires it up).
 */

import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import { scrub, scrubString } from '../backend/src/observability/scrubber';
import {
  cronExecutionTotal,
  registry,
} from '../backend/src/observability/metrics';
import { withCronMetric } from '../backend/src/observability/cron-trace';

describe('Observability — PII scrubber (unit)', () => {
  describe('value-pattern scrubbing on strings', () => {
    it('redacts a single email address', () => {
      expect(scrubString('contact alice@example.com today')).toBe(
        'contact [email] today',
      );
    });

    it('redacts multiple emails in one string', () => {
      expect(
        scrubString('from a@x.com to bob.smith+work@example.co.in'),
      ).toBe('from [email] to [email]');
    });

    it('redacts an Indian 10-digit mobile starting with 6-9', () => {
      expect(scrubString('call me at 9876543210 today')).toBe(
        'call me at [phone] today',
      );
    });

    it('does NOT redact 10-digit numbers starting with 0-5', () => {
      // These are not Indian-mobile-pattern; leave as-is (could be GSTIN,
      // tracking ID, order number, etc.).
      expect(scrubString('order 1234567890 shipped')).toBe(
        'order 1234567890 shipped',
      );
    });

    it('redacts card-like digit runs (defence in depth)', () => {
      expect(scrubString('saw 4111 1111 1111 1111 in logs')).toBe(
        'saw [card] in logs',
      );
    });

    it('leaves benign strings unchanged', () => {
      expect(scrubString('order created successfully')).toBe(
        'order created successfully',
      );
    });
  });

  describe('field-name scrubbing on objects', () => {
    it('redacts top-level PII keys', () => {
      const result = scrub({
        userId: 42,
        email: 'a@b.com',
        phone: '9876543210',
        firstName: 'Alice',
        amount: 1234.56,
      });
      expect(result).toEqual({
        userId: 42,
        email: '[redacted]',
        phone: '[redacted]',
        firstName: '[redacted]',
        amount: '[redacted]',
      });
    });

    it('recursively scrubs nested PII keys', () => {
      const result = scrub({
        order: {
          id: 1,
          customer: {
            email: 'x@y.com',
            address: { line1: '1 Main St', city: 'Mumbai' },
          },
        },
      });
      expect(result).toEqual({
        order: {
          id: 1,
          customer: {
            email: '[redacted]',
            address: '[redacted]',
          },
        },
      });
    });

    it('scrubs PII inside arrays', () => {
      const result = scrub({
        items: [
          { sku: 'A', email: 'a@b.com' },
          { sku: 'B', email: 'c@d.com' },
        ],
      });
      expect(result).toEqual({
        items: [
          { sku: 'A', email: '[redacted]' },
          { sku: 'B', email: '[redacted]' },
        ],
      });
    });

    it('redacts secrets/tokens/auth headers', () => {
      const result = scrub({
        authorization: 'Bearer abc.def.ghi',
        cookie: 'session=xyz',
        password: 'plaintext',
        token: 'jwt.payload.sig',
        accessToken: 't1',
        refreshToken: 't2',
        cardNumber: '4111111111111111',
        cvv: '123',
        otp: '987654',
      });
      Object.values(result).forEach((v) => expect(v).toBe('[redacted]'));
    });

    it('scrubs emails embedded in non-PII-named string fields', () => {
      // A free-text field (e.g. error message) that happens to contain
      // an email should be value-scrubbed even though the key is innocent.
      const result = scrub({
        errorMessage: 'User alice@example.com cannot proceed',
        ip: '203.0.113.5',
      });
      expect(result).toEqual({
        errorMessage: 'User [email] cannot proceed',
        ip: '203.0.113.5',
      });
    });
  });

  describe('safety properties', () => {
    it('handles null and undefined', () => {
      expect(scrub(null)).toBeNull();
      expect(scrub(undefined)).toBeUndefined();
    });

    it('passes through primitives unchanged', () => {
      expect(scrub(42)).toBe(42);
      expect(scrub(true)).toBe(true);
      expect(scrub(false)).toBe(false);
    });

    it('does not mutate the input object', () => {
      const input = { email: 'a@b.com', userId: 1 };
      const copy = { ...input };
      scrub(input);
      expect(input).toEqual(copy);
    });

    it('handles cyclic objects without infinite recursion', () => {
      const cyclic: { self?: unknown; email: string } = { email: 'a@b.com' };
      cyclic.self = cyclic;
      // Must not throw / hang.
      const result = scrub(cyclic) as { email: string; self: unknown };
      expect(result.email).toBe('[redacted]');
      // The self-reference is preserved (cycle guard returns the value
      // as-is once it sees it the second time).
      expect(result.self).toBeDefined();
    });

    it('returns a new object — does not return the same reference', () => {
      const input = { foo: 'bar' };
      const result = scrub(input);
      expect(result).not.toBe(input);
      expect(result).toEqual(input);
    });
  });
});

describe('Observability — /api/metrics endpoint (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('returns 200 with Prometheus text content-type', async () => {
    // In NODE_ENV=test the BasicAuth gate is bypassed (dev/test = open).
    await request(app.getHttpServer())
      .get('/api/metrics')
      .expect(200)
      .expect('content-type', /text\/plain/);
  });

  it('exposes default process metrics with shopverse_ prefix', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/metrics')
      .expect(200);
    // collectDefaultMetrics adds e.g. process_cpu_user_seconds_total —
    // with our prefix it becomes shopverse_process_cpu_user_seconds_total.
    expect(res.text).toContain('shopverse_process_cpu_user_seconds_total');
    expect(res.text).toContain('shopverse_nodejs_eventloop_lag_seconds');
  });

  it('exposes the shopverse_cron_executions_total counter (registered at import time)', async () => {
    // The metric is registered when observability/metrics.ts is imported.
    // Bump it once so it has a sample. This proves the registry, the
    // counter, and the /metrics scrape path all work end-to-end.
    cronExecutionTotal.inc({ name: 'test:metrics:probe', status: 'ok' });
    const res = await request(app.getHttpServer())
      .get('/api/metrics')
      .expect(200);
    expect(res.text).toContain('shopverse_cron_executions_total');
    expect(res.text).toMatch(/name="test:metrics:probe"/);
  });

  it('exposes service label on all metrics', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/metrics')
      .expect(200);
    expect(res.text).toMatch(/service="shopverse-backend"/);
  });
});

describe('Observability — withCronMetric helper (unit)', () => {
  // The cron-executions counter has labels [name, status] plus the
  // registry's default `service` label. The order prom-client serialises
  // them in can vary, so match on the count via a value-lookup helper
  // rather than a rigid regex.

  async function counterValue(
    name: string,
    status: 'ok' | 'error',
  ): Promise<number> {
    const text = await registry.getSingleMetricAsString(
      'shopverse_cron_executions_total',
    );
    // Match any line containing both labels (any order) ending in `} <num>`.
    const lines = text.split('\n').filter(
      (l) =>
        l.includes(`name="${name}"`) &&
        l.includes(`status="${status}"`) &&
        !l.startsWith('#'),
    );
    if (lines.length === 0) return 0;
    const m = lines[0].match(/}\s+(\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) : 0;
  }

  it('returns the wrapped fn result on success and increments the ok counter', async () => {
    const before = await counterValue('unit:test:withcron:ok', 'ok');
    const result = await withCronMetric('unit:test:withcron:ok', async () => 42);
    expect(result).toBe(42);
    const after = await counterValue('unit:test:withcron:ok', 'ok');
    expect(after).toBe(before + 1);
  });

  it('re-throws errors and increments the error counter', async () => {
    const before = await counterValue('unit:test:withcron:err', 'error');
    await expect(
      withCronMetric('unit:test:withcron:err', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const after = await counterValue('unit:test:withcron:err', 'error');
    expect(after).toBe(before + 1);
  });
});
