// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { RefundRetryService } from './refund-retry.service';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { WalletModule } from '../wallet/wallet.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';

@Module({
  imports: [WebhooksModule, WalletModule, InvoicesModule, LoyaltyModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, RefundRetryService],
})
export class PaymentsModule {}
