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
