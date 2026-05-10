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

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url, ip, headers } = req;
    const userId = req.user?.id ?? null;
    const startMs = Date.now();

    return next.handle().pipe(
      tap((body) => {
        const res = context.switchToHttp().getResponse();
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
      catchError((err) => {
        const ms = Date.now() - startMs;
        this.logger.error(
          JSON.stringify({
            level: 'error',
            method,
            url,
            statusCode: err.status ?? 500,
            userId,
            ip,
            durationMs: ms,
            error: err.message,
            timestamp: new Date().toISOString(),
          }),
        );
        return throwError(() => err);
      }),
    );
  }
}
