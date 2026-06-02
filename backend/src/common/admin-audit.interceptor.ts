// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedRequest } from './types';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

// Fields to redact from body snapshots
const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'cardNumber',
  'cvv',
  'authorization',
]);

function sanitize(obj: unknown, depth = 0): unknown {
  if (depth > 4 || obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj))
    return obj.slice(0, 20).map((v) => sanitize(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.has(k.toLowerCase())
      ? '[REDACTED]'
      : sanitize(v, depth + 1);
  }
  return out;
}

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!MUTATING_METHODS.has(req.method)) return next.handle();

    const user = req.user;
    if (!user?.id) return next.handle();

    const url: string = req.url ?? '';
    // Only audit /api/admin/* routes
    if (!url.includes('/admin/') && !url.includes('/admin'))
      return next.handle();

    return next.handle().pipe(
      tap({
        next: () => {
          // Extract entity and entityId from URL: /api/admin/orders/42 → entity=orders, entityId=42
          const segments = url
            .replace(/^\/api/, '')
            .replace(/^\/admin/, '')
            .split('/')
            .filter(Boolean);
          const entity = segments[0] ?? 'unknown';
          const entityId = segments[1] ?? null;

          const action = `${req.method}_${entity.toUpperCase().replace(/-/g, '_')}`;

          this.prisma.adminAuditLog
            .create({
              data: {
                adminId: user.id,
                action,
                entity,
                entityId: entityId ?? undefined,
                method: req.method,
                url,
                // sanitize returns a safe JSON-serializable structure
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                body: req.body
                  ? (sanitize(req.body as unknown) as any)
                  : undefined,
                ip: req.ip,
              },
            })
            .catch(() => {
              /* non-blocking */
            });
        },
      }),
    );
  }
}
