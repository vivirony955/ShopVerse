// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Global, Module } from '@nestjs/common';
import { ErrorTrackingService } from './error-tracking.service';
import { CronLockService } from './cron-lock.service';
import { InvariantValidatorService } from './invariant-validator.service';
import { RedisService } from './redis.service';
import { HookRunner } from './hook-runner.service';
import { PluginLoader } from './plugin-loader.service';
import { PluginRuntimeStateService } from './plugin-runtime-state.service';
import { PluginAuditService } from './plugin-audit.service';
import { PluginAdminController } from './plugin-admin.controller';
import { PluginCronRegistry } from './plugin-cron.registry';
import { PluginQueueRegistry } from './plugin-queue.registry';
import { PluginRouteRegistry } from './plugin-route.registry';
import { PluginStrategyRegistry } from './plugin-strategy.registry';
import { PluginPaymentWebhookController } from './plugin-payment-webhook.controller';
import { PluginConfigService } from './plugin-config.service';

@Global()
@Module({
  controllers: [PluginAdminController, PluginPaymentWebhookController],
  providers: [
    ErrorTrackingService,
    CronLockService,
    InvariantValidatorService,
    RedisService,
    HookRunner,
    PluginLoader,
    PluginRuntimeStateService,
    PluginAuditService,
    PluginCronRegistry,
    PluginQueueRegistry,
    PluginRouteRegistry,
    PluginStrategyRegistry,
    PluginConfigService,
  ],
  exports: [
    ErrorTrackingService,
    CronLockService,
    InvariantValidatorService,
    RedisService,
    HookRunner,
    PluginLoader,
    PluginRuntimeStateService,
    PluginAuditService,
    PluginCronRegistry,
    PluginQueueRegistry,
    PluginRouteRegistry,
    PluginStrategyRegistry,
    PluginConfigService,
  ],
})
export class CommonModule {}
