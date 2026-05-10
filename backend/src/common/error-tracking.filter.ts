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
import { Request, Response } from 'express';
import { ErrorTrackingService } from './error-tracking.service';

@Catch()
export class ErrorTrackingFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorTrackingFilter.name);

  constructor(private readonly errorTracking: ErrorTrackingService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? ((exception.getResponse() as any)?.message ?? exception.message)
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
          userId: (req as any).user?.id,
          statusCode: status,
          metadata: { body: req.body, params: req.params },
        })
        .catch(() => null);
    }

    res.status(status).json({
      statusCode: status,
      message: Array.isArray(message) ? message : [message],
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }
}
