// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { CouponsModule } from '../coupons/coupons.module';
import { EmailModule } from '../email/email.module';
import { FraudModule } from '../fraud/fraud.module';
import { CartModule } from '../cart/cart.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { ReferralModule } from '../referral/referral.module';
import { InventoryModule } from '../inventory/inventory.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    CouponsModule,
    EmailModule,
    FraudModule,
    CartModule,
    LoyaltyModule,
    ReferralModule,
    InventoryModule,
    WalletModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
