// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import type { Request, Response } from 'express';
import { httpRequestDuration, httpRequestTotal, routeLabel } from './metrics';

/**
 * Records request duration + count into the Prometheus registry.
 *
 * Applied globally via main.ts so every request path is observed.
 * Excludes /metrics and /health from observation to avoid self-noise.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctxType = context.getType();
    if (ctxType !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const url = req.url ?? '';
    // Skip self-noise.
    if (url === '/metrics' || url === '/api/health') {
      return next.handle();
    }

    const start = process.hrtime.bigint();
    const method = req.method;
    // Express puts the matched route on req.route.path. NestJS preserves it.
    const route = routeLabel(
      (req as Request & { route?: { path?: string } }).route?.path,
      url,
    );

    const record = (statusCode: number) => {
      const elapsedNs = process.hrtime.bigint() - start;
      const elapsedSec = Number(elapsedNs) / 1e9;
      const labels = { method, route, status_code: String(statusCode) };
      httpRequestDuration.observe(labels, elapsedSec);
      httpRequestTotal.inc(labels);
    };

    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse<Response>();
        record(res.statusCode);
      }),
      catchError((err: unknown) => {
        const status = (err as { status?: number }).status ?? 500;
        record(status);
        return throwError(() => err);
      }),
    );
  }
}
