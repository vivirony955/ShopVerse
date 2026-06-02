// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Module } from '@nestjs/common';
import { VolumeDiscountsController } from './volume-discounts.controller';
import { VolumeDiscountsService } from './volume-discounts.service';

/**
 * No bootstrap class — volume-discounts has no cron, no event
 * subscriber, no kernel hook to register. The data is read on-demand
 * by the controller (`/api/volume-discounts/*`) and the helper
 * `getBestDiscount(productId, qty)`. No kernel module consumes this
 * service today; pricing logic does NOT read VolumeDiscount, so the
 * Tier 2 caveat in plan §3 ("the one read site in pricing") does not
 * apply — full Tier 3 extraction is safe.
 *
 * If a future kernel call site needs volume discounts, the right
 * model is to register a `DiscountStrategy` (plan §4 Type 4) instead
 * of importing this service directly.
 */
@Module({
  controllers: [VolumeDiscountsController],
  providers: [VolumeDiscountsService],
  exports: [VolumeDiscountsService],
})
export class VolumeDiscountsPluginModule {}
