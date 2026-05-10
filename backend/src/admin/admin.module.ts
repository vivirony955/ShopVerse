// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminAuditInterceptor } from '../common/admin-audit.interceptor';
import { AnalyticsModule } from '../analytics/analytics.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [AnalyticsModule, WalletModule],
  controllers: [AdminController],
  providers: [
    AdminService,
    { provide: APP_INTERCEPTOR, useClass: AdminAuditInterceptor },
  ],
})
export class AdminModule {}
