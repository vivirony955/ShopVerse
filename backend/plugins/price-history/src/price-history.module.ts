// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, Module, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { PriceHistoryController } from './price-history.controller';
import { PriceHistoryService } from './price-history.service';
import { PluginCronRegistry } from '../../../src/common/plugin-cron.registry';

const PLUGIN_ID = '@shopverse/plugin-price-history';

/**
 * Bootstrap: registers the snapshot cron with the kernel's
 * PluginCronRegistry so `/admin/plugins` lists it operationally.
 *
 * The @Cron decorator below on `PriceHistoryCron` is what NestJS's
 * SchedulerRegistry actually fires; the PluginCronRegistry entry is
 * the observability view. Both MUST agree — same name, same interval.
 * Mirrors the pilot pattern from PriceAlertsCron / Bootstrap.
 */
@Injectable()
class PriceHistoryBootstrap implements OnApplicationBootstrap {
  constructor(
    private readonly cronRegistry: PluginCronRegistry,
    private readonly service: PriceHistoryService,
  ) {}

  onApplicationBootstrap(): void {
    this.cronRegistry.register(PLUGIN_ID, {
      name: 'snapshot',
      // EVERY_DAY_AT_MIDNIGHT → 24h interval, surfaced for operators
      // as a round-number minutes value (24 × 60).
      intervalMinutes: 24 * 60,
      handler: () => this.service.snapshotPrices(),
    });
  }
}

/**
 * Decorator-bearing wrapper. The actual cron expression lives here so
 * the service stays decorator-free (Jest specs that exercise
 * `runSnapshot` directly don't need the scheduler running).
 *
 * Future improvement when W1.T34's runtime piece lands: drop the
 * decorator, have the worker bootstrap iterate PluginCronRegistry and
 * call SchedulerRegistry.addCronJob dynamically. Deferred from the
 * pilot; tracked for the same wave.
 */
@Injectable()
class PriceHistoryCron {
  constructor(
    private readonly service: PriceHistoryService,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private readonly _scheduler: SchedulerRegistry,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  run(): Promise<void> {
    return this.service.snapshotPrices();
  }
}

@Module({
  controllers: [PriceHistoryController],
  providers: [
    PriceHistoryService,
    PriceHistoryBootstrap,
    PriceHistoryCron,
  ],
  exports: [PriceHistoryService],
})
export class PriceHistoryPluginModule {}
