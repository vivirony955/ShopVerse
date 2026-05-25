// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { EmailModule } from './email/email.module';

/**
 * Minimal module graph for the worker process.
 *
 * Intentionally OMITS:
 *   - All `*Controller`s (no HTTP surface)
 *   - `ThrottlerModule` (no inbound requests to throttle)
 *   - `ScheduleModule` (crons stay on the API process — splitting them
 *     would fragment control flow with no clear benefit at our scale)
 *   - 25+ feature modules that exist purely to wire controllers
 *
 * KEEPS:
 *   - `ConfigModule` (global) — env access
 *   - `BullModule.forRootAsync` — Redis connection for queues
 *   - `PrismaModule` (global) — DB access for queue consumers
 *   - `CommonModule` (global) — ErrorTrackingService, RedisService,
 *     CronLockService (used by queue consumers that take distributed
 *     locks even though the worker itself isn't running crons)
 *   - `EmailModule` — registers the `email` queue + `EmailProcessor`
 *
 * Future queues (when added) are imported here and ONLY here. The
 * AppModule continues to import their producer-side EmailService etc.
 * via EmailModule for HTTP request paths that need to enqueue.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // Same BullMQ config as AppModule, so producer (in API) and consumer
    // (in worker) connect to the same Redis with identical defaults.
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL', 'redis://localhost:6379'),
          retryStrategy:
            process.env.NODE_ENV === 'test' ? () => 3_600_000 : undefined,
        },
      }),
      inject: [ConfigService],
    }),

    PrismaModule,
    CommonModule,
    EmailModule,
  ],
})
export class WorkerModule {}
