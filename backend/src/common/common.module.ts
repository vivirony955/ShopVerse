// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Global, Module } from '@nestjs/common';
import { ErrorTrackingService } from './error-tracking.service';
import { CronLockService } from './cron-lock.service';
import { InvariantValidatorService } from './invariant-validator.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [ErrorTrackingService, CronLockService, InvariantValidatorService, RedisService],
  exports: [ErrorTrackingService, CronLockService, InvariantValidatorService, RedisService],
})
export class CommonModule {}
