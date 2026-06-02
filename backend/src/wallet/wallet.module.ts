// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { OrderCashbackSubscriber } from './order-cashback.subscriber';
import { CouponsModule } from '../coupons/coupons.module';

@Module({
  // CouponsModule is imported because OrderCashbackSubscriber depends on
  // CouponsService.calcCashback. The F4-07 inline cashback computation
  // previously lived in OrdersService where CouponsService was already
  // in scope; the W3.T3 subscriber needs its own reference.
  imports: [CouponsModule],
  controllers: [WalletController],
  providers: [WalletService, OrderCashbackSubscriber],
  exports: [WalletService],
})
export class WalletModule {}
