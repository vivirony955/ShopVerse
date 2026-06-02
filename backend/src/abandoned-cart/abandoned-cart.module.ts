// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Global, Module } from '@nestjs/common';
import { AbandonedCartService } from './abandoned-cart.service';
import { OrderPlacedAbandonedCartSubscriber } from './order-placed.subscriber';

@Global()
@Module({
  providers: [AbandonedCartService, OrderPlacedAbandonedCartSubscriber],
  exports: [AbandonedCartService],
})
export class AbandonedCartModule {}
