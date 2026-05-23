// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { trace } from '@opentelemetry/api';
import { AuthenticatedRequest } from './types';

/**
 * Extracts trace_id and span_id from the active OTel span context.
 * Returns empty strings when no span is active (e.g. test env where
 * the SDK is disabled). Logs gain the correlation fields when tracing
 * is on, lose nothing when off.
 */
function traceContext(): { trace_id: string; span_id: string } {
  const span = trace.getActiveSpan();
  if (!span) return { trace_id: '', span_id: '' };
  const ctx = span.spanContext();
  return { trace_id: ctx.traceId, span_id: ctx.spanId };
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { method, url, ip, headers } = req;
    const userId = req.user?.id ?? null;
    const startMs = Date.now();

    return next.handle().pipe(
      tap((_body) => {
        const res = context
          .switchToHttp()
          .getResponse<{ statusCode: number }>();
        const ms = Date.now() - startMs;
        this.logger.log(
          JSON.stringify({
            level: 'info',
            method,
            url,
            statusCode: res.statusCode,
            userId,
            ip,
            userAgent: headers['user-agent'] ?? '',
            durationMs: ms,
            timestamp: new Date().toISOString(),
            ...traceContext(),
          }),
        );
      }),
      catchError((err: unknown) => {
        const ms = Date.now() - startMs;
        const status = (err as { status?: number }).status ?? 500;
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          JSON.stringify({
            level: 'error',
            method,
            url,
            statusCode: status,
            userId,
            ip,
            durationMs: ms,
            error: message,
            timestamp: new Date().toISOString(),
            ...traceContext(),
          }),
        );
        return throwError(() => err);
      }),
    );
  }
}
