// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import * as Sentry from '@sentry/node';
import { trace } from '@opentelemetry/api';
import { ErrorTrackingService } from './error-tracking.service';
import { AuthenticatedRequest } from './types';
import { httpUnhandledErrors, routeLabel } from '../observability/metrics';

@Catch()
export class ErrorTrackingFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorTrackingFilter.name);

  constructor(private readonly errorTracking: ErrorTrackingService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<AuthenticatedRequest>();
    const res = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const rawResponse =
      exception instanceof HttpException ? exception.getResponse() : null;
    const message =
      exception instanceof HttpException
        ? ((rawResponse as { message?: string })?.message ?? exception.message)
        : exception instanceof Error
          ? exception.message
          : 'Internal server error';

    const stack = exception instanceof Error ? exception.stack : undefined;

    // Only track 5xx errors and unexpected exceptions — skip 4xx (user errors)
    if (status >= 500 || !(exception instanceof HttpException)) {
      this.errorTracking
        .log({
          level: status >= 500 ? 'error' : 'warn',
          message: Array.isArray(message)
            ? message.join('; ')
            : String(message),
          stack,
          method: req.method,
          url: req.url,
          userId: req.user?.id,
          statusCode: status,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          metadata: { body: req.body, params: req.params },
        })
        .catch(() => null);

      // A2 observability: bump unhandled-error counter for 5xx so dashboards
      // can alert on error-rate spikes without parsing logs.
      if (status >= 500) {
        const route = routeLabel(
          (req as AuthenticatedRequest & { route?: { path?: string } }).route
            ?.path,
          req.url,
        );
        httpUnhandledErrors.inc({ route });

        // Force-sample the current span if tracing is active so the trace
        // that errored is always exported, even under head-sampling.
        const span = trace.getActiveSpan();
        if (span) {
          span.setAttribute('sampling.priority', 1);
          span.recordException(exception as Error);
        }

        // Send to Sentry (no-op if SENTRY_DSN unset). The beforeSend hook
        // in observability/sentry.ts scrubs PII before transmission.
        if (process.env.SENTRY_DSN) {
          Sentry.withScope((scope) => {
            scope.setTag('route', req.url);
            scope.setTag('http.method', req.method);
            scope.setTag('http.status_code', String(status));
            if (req.user?.id != null) {
              scope.setUser({ id: String(req.user.id) });
            }
            scope.setLevel('error');
            Sentry.captureException(exception);
          });
        }
      }
    }

    res.status(status).json({
      statusCode: status,
      message: Array.isArray(message) ? message : [message],
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }
}
