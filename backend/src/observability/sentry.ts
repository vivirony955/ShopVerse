// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * Sentry error tracking.
 *
 * Imported AFTER tracing.ts in main.ts. Sentry is configured for
 * ERROR CAPTURE ONLY — we use OpenTelemetry for distributed tracing
 * (DD-1, DD-3 in the A2 design plan) and explicitly disable Sentry's
 * own tracing integrations to avoid double-instrumentation overhead.
 *
 * Off by default; activates only when SENTRY_DSN is set and
 * NODE_ENV !== 'test'.
 *
 * PII strategy:
 *   - `beforeSend` runs on every event — recursive scrub via scrubber.ts.
 *   - `beforeBreadcrumb` runs on every breadcrumb — same scrubber.
 *   - server_name (hostname) is stripped to avoid leaking deployment
 *     topology.
 *   - User context carries the numeric id only; never email/ip.
 */

import * as Sentry from '@sentry/node';
import { scrub } from './scrubber';

interface GlobalWithSentry {
  __shopverse_sentry_initialised?: boolean;
}

const g = globalThis as GlobalWithSentry;

export function initSentry(): void {
  if (g.__shopverse_sentry_initialised) return;
  if (process.env.NODE_ENV === 'test') return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    // eslint-disable-next-line no-console
    console.log(
      '[sentry] disabled — set SENTRY_DSN to enable error reporting',
    );
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    // We use OpenTelemetry for tracing — keep Sentry to error capture only.
    tracesSampleRate: 0,
    // `skipOpenTelemetrySetup` is honoured by Sentry SDK v8+ to prevent it
    // from registering its own OTel SDK, which would conflict with ours.
    skipOpenTelemetrySetup: true,
    sendDefaultPii: false,
    beforeSend(event) {
      // Recursively scrub every nested object — request, contexts, extra,
      // tags, breadcrumbs (handled separately below), user, etc.
      if (event.request) event.request = scrub(event.request);
      if (event.extra) event.extra = scrub(event.extra);
      if (event.contexts) event.contexts = scrub(event.contexts);
      if (event.tags) event.tags = scrub(event.tags);
      // Drop server_name — can leak hostname / pod name patterns.
      if (event.server_name) event.server_name = '[server]';
      // User: keep numeric id only; never email/ip_address even if Sentry
      // SDK populates them automatically.
      if (event.user) {
        event.user = { id: event.user.id ? String(event.user.id) : undefined };
      }
      // Scrub free-text message and exception.values[].value for embedded
      // emails/phones/cards.
      if (event.message && typeof event.message === 'string') {
        event.message = scrub(event.message);
      }
      if (event.exception?.values) {
        for (const v of event.exception.values) {
          if (v.value) v.value = scrub(v.value);
        }
      }
      return event;
    },
    beforeBreadcrumb(crumb) {
      if (crumb.data) crumb.data = scrub(crumb.data);
      if (crumb.message) crumb.message = scrub(crumb.message);
      return crumb;
    },
  });

  g.__shopverse_sentry_initialised = true;
  // eslint-disable-next-line no-console
  console.log(
    `[sentry] enabled — env=${process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV} release=${process.env.SENTRY_RELEASE ?? 'unset'}`,
  );
}

export { Sentry };
