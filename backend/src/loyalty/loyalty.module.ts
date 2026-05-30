// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Module } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyController } from './loyalty.controller';
import { OrderDeliveredLoyaltySubscriber } from './order-delivered.subscriber';

@Module({
  controllers: [LoyaltyController],
  providers: [LoyaltyService, OrderDeliveredLoyaltySubscriber],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
