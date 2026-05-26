// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, Module, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { PriceAlertsController } from './price-alerts.controller';
import { PriceAlertsService } from './price-alerts.service';
import { EmailModule } from '../../../src/email/email.module';
import { HookRunner } from '../../../src/common/hook-runner.service';
import { PluginCronRegistry } from '../../../src/common/plugin-cron.registry';

const PLUGIN_ID = '@shopverse/plugin-price-alerts';

/**
 * Bootstrap glue: registers the plugin's hooks + cron with the kernel
 * registries on application start.
 *
 * Why a thin Nest provider instead of the plain-object ShopVersePlugin
 * pattern: the plugin's hooks need DI access to PriceAlertsService,
 * which itself needs PrismaService. Letting Nest wire the dependency
 * graph and then registering hook/cron handlers in
 * OnApplicationBootstrap is far simpler than running onRegister
 * pre-Nest with a manually constructed kernel context. The plain-
 * object lifecycle stays the documented contract for THIRD-PARTY
 * plugins (which can't extend AppModule); the FIRST-PARTY pilot uses
 * the Nest-native shortcut.
 */
@Injectable()
class PriceAlertsBootstrap implements OnApplicationBootstrap {
  constructor(
    private readonly hooks: HookRunner,
    private readonly cronRegistry: PluginCronRegistry,
    private readonly service: PriceAlertsService,
  ) {}

  onApplicationBootstrap(): void {
    // GDPR cascade — kernel calls this hook before deleting a User.
    this.hooks.register('user.beforeDelete', PLUGIN_ID, (ctx) =>
      this.service.deleteAllForUser(ctx.userId),
    );

    // Cron registry entry — visible via /admin/plugins, runs on worker.
    this.cronRegistry.register(PLUGIN_ID, {
      name: 'check-alerts',
      intervalMinutes: 60,
      handler: () => this.service.checkAlerts(),
    });
  }
}

/**
 * Wrapper that owns the @Cron decorator. The decorator-based schedule
 * is what NestJS's SchedulerRegistry actually fires; the
 * PluginCronRegistry entry above is the operational view (what
 * /admin/plugins lists). Both must agree — same name, same interval.
 *
 * Future improvement: drop the decorator and have the worker bootstrap
 * iterate PluginCronRegistry, calling SchedulerRegistry.addCronJob
 * dynamically. That's W1.T34's runtime piece, deferred from this pilot.
 */
@Injectable()
class PriceAlertsCron {
  constructor(
    private readonly service: PriceAlertsService,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private readonly _scheduler: SchedulerRegistry,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  run() {
    return this.service.checkAlerts();
  }
}

@Module({
  imports: [EmailModule],
  controllers: [PriceAlertsController],
  providers: [PriceAlertsService, PriceAlertsBootstrap, PriceAlertsCron],
})
export class PriceAlertsPluginModule {}
