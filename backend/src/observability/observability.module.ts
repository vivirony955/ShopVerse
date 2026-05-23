// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';

/**
 * Hosts the /metrics Prometheus endpoint.
 *
 * The OTel SDK init and Sentry init live OUTSIDE the Nest module
 * graph (in tracing.ts + sentry.ts) because they must initialise
 * before any NestJS imports are evaluated.
 *
 * This module is intentionally minimal — it just registers the
 * controller. The MetricsInterceptor is applied globally in main.ts.
 */
@Module({
  controllers: [MetricsController],
})
export class ObservabilityModule {}
