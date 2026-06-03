// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Module } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';

/**
 * TelemetryModule — opt-out anonymous usage heartbeat (Phase 4 capture layer).
 *
 * PrismaService is provided globally (PrismaModule is @Global), so this module
 * only needs to register the service. Scheduling uses the app-wide
 * ScheduleModule already bootstrapped in AppModule.
 */
@Module({
  providers: [TelemetryService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
