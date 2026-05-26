// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EventBus } from './event-bus.service';
import { EventHandlerRegistry } from './event-handler.registry';
import { EventDispatcherProcessor } from './event-bus.processor';

/**
 * Shared event bus (plan §4 Type 3 + §10 E6 — W3 foundation).
 *
 * BullMQ queue config:
 *   - 5 attempts with exponential backoff (events should be more
 *     resilient than emails — 3 attempts there, 5 here — because
 *     consumer handlers are idempotent by construction so extra
 *     retries are cheap)
 *   - removeOnComplete: 1000 (keeps recent completed jobs for
 *     debugging without growing unbounded)
 *   - removeOnFail: 5000 (retain failures long enough for ops to
 *     inspect; DLQ tooling lives in W6)
 *
 * @Global so any plugin module / kernel service can inject EventBus
 * without re-importing this module.
 */
@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'shopverse-events',
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    }),
  ],
  providers: [EventBus, EventHandlerRegistry, EventDispatcherProcessor],
  exports: [EventBus, EventHandlerRegistry, BullModule],
})
export class EventBusModule {}
