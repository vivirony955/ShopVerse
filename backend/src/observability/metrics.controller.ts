// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import {
  Controller,
  Get,
  Header,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { registry } from './metrics';

/**
 * `/metrics` Prometheus scrape endpoint.
 *
 * Auth model:
 *   - In production: requires BasicAuth credentials matching the
 *     METRICS_BASIC_AUTH env var ("user:pass"). If env var unset in
 *     production, the endpoint returns 503 — fail closed.
 *   - In dev/test: open. Local Prometheus / curl can scrape without
 *     auth.
 *
 * The endpoint is mounted OUTSIDE the global JWT guard via the
 * @Public() decorator (no human user is calling /metrics).
 *
 * Routed under the global /api prefix → final URL is /api/metrics.
 * We rely on Prometheus's metrics_path config to point at this URL.
 */
@Controller('metrics')
export class MetricsController {
  @Public()
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async scrape(@Req() req: Request, @Res() res: Response): Promise<void> {
    const isProd = process.env.NODE_ENV === 'production';
    const cred = process.env.METRICS_BASIC_AUTH;

    if (isProd) {
      if (!cred) {
        // Fail closed in prod: misconfigured deploy must not leak metrics.
        res.status(503).send('metrics endpoint not configured');
        return;
      }
      if (!checkBasicAuth(req, cred)) {
        res.set('WWW-Authenticate', 'Basic realm="metrics"');
        throw new UnauthorizedException();
      }
    }

    const text = await registry.metrics();
    res.status(200).send(text);
  }
}

function checkBasicAuth(req: Request, expected: string): boolean {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Basic ')) return false;
  const encoded = header.slice('Basic '.length).trim();
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  // Constant-time comparison to mitigate timing-based credential probing.
  const a = Buffer.from(decoded);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
