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
import { AuthenticatedRequest } from './types';

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
          }),
        );
        return throwError(() => err);
      }),
    );
  }
}
