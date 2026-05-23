// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { BrandsModule } from './brands/brands.module';
import { ProductsModule } from './products/products.module';
import { CartModule } from './cart/cart.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { CouponsModule } from './coupons/coupons.module';
import { OrdersModule } from './orders/orders.module';
import { ReviewsModule } from './reviews/reviews.module';
import { PaymentsModule } from './payments/payments.module';
import { EmailModule } from './email/email.module';
import { FaqsModule } from './faqs/faqs.module';
import { DeliveryModule } from './delivery/delivery.module';
import { FlashSalesModule } from './flash-sales/flash-sales.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { ReferralModule } from './referral/referral.module';
import { AbandonedCartModule } from './abandoned-cart/abandoned-cart.module';
import { AdminModule } from './admin/admin.module';
import { InvoicesModule } from './invoices/invoices.module';
import { WarehouseModule } from './warehouse/warehouse.module';
import { WalletModule } from './wallet/wallet.module';
import { FraudModule } from './fraud/fraud.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { SupportModule } from './support/support.module';
import { AffiliateModule } from './affiliate/affiliate.module';
import { ExperienceModule } from './experience/experience.module';
import { LegalModule } from './legal/legal.module';
import { CommonModule } from './common/common.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ExchangeModule } from './exchange/exchange.module';
import { QaModule } from './qa/qa.module';
import { PriceAlertsModule } from './price-alerts/price-alerts.module';
import { BlogModule } from './blog/blog.module';
import { PriceHistoryModule } from './price-history/price-history.module';
import { VolumeDiscountsModule } from './volume-discounts/volume-discounts.module';
import { ObservabilityModule } from './observability/observability.module';

@Module({
  imports: [
    // ─── Config — loads .env and makes ConfigService available everywhere ──────
    ConfigModule.forRoot({ isGlobal: true }),

    // ─── Rate limiting — 100 requests per 60 seconds per IP by default ─────────
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    // ─── Scheduler — enables @Cron decorators ───────────────────────────────────
    ScheduleModule.forRoot(),

    // ─── BullMQ — async job queues (email, etc.) ────────────────────────────────
    // Degrades gracefully: if REDIS_URL is not set, queues are unavailable but
    // the app starts. EmailService falls back to synchronous send in that case.
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL', 'redis://localhost:6379'),
          // In test environments where Redis is not available, use a 1-hour retry
          // delay so ioredis stays in "reconnecting" state (commands queue silently)
          // rather than permanently closing the connection (which breaks BullMQ init).
          // No retries fire during the 2-minute test run, and the timer is cancelled
          // when app.close() is called — eliminating "Cannot log after tests are done".
          retryStrategy: process.env.NODE_ENV === 'test' ? () => 3_600_000 : undefined,
        },
      }),
      inject: [ConfigService],
    }),

    // ─── Data ───────────────────────────────────────────────────────────────────
    PrismaModule, // @Global — provides PrismaService everywhere

    // ─── Core feature modules ────────────────────────────────────────────────────
    AuthModule,
    UsersModule,
    CategoriesModule,
    BrandsModule,
    ProductsModule,
    CartModule,
    WishlistModule,
    CouponsModule,
    OrdersModule,
    ReviewsModule,
    PaymentsModule,
    EmailModule,
    FaqsModule,
    DeliveryModule,
    FlashSalesModule,
    LoyaltyModule,
    ReferralModule,
    AbandonedCartModule,
    AdminModule,
    InvoicesModule,

    // ─── Advanced feature modules ─────────────────────────────────────────────
    WarehouseModule, // Smart order routing, inventory, partial shipments
    WalletModule, // Store credits, double-entry ledger, payment reconciliation
    FraudModule, // Risk scoring, blacklist, fraud flags
    WebhooksModule, // Event webhooks with retry logic
    SupportModule, // Support tickets, admin notes, SLA tracking
    AffiliateModule, // Affiliate/influencer tracking, UTM attribution
    ExperienceModule, // Save-for-later, delivery slots, gift options, buy-again
    LegalModule, // Policies, cookie consent
    CommonModule, // @Global: ErrorTrackingService available everywhere
    NotificationsModule, // F2-06: In-app notification center
    ExchangeModule, // F2-12: Exchange flow (swap product after delivery)
    QaModule, // F2-14: Customer Q&A on PDPs
    PriceAlertsModule, // F2-17: Price drop alert emails
    BlogModule, // F3-10: Blog / content CMS
    PriceHistoryModule, // F3-12: Daily price snapshots for charts
    VolumeDiscountsModule, // F4-08: Tiered quantity discounts

    // ─── Observability (A2) ───────────────────────────────────────────────────
    // Hosts /api/metrics. OTel SDK + Sentry initialise in main.ts before
    // any NestJS import is evaluated (see observability/tracing.ts).
    ObservabilityModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Apply ThrottlerGuard globally — default 100 req/60s; override per-endpoint with @Throttle()
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
