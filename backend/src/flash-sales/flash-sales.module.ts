// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Module } from '@nestjs/common';
import { FlashSalesService } from './flash-sales.service';
import { FlashSalesController } from './flash-sales.controller';

@Module({
  controllers: [FlashSalesController],
  providers: [FlashSalesService],
  exports: [FlashSalesService],
})
export class FlashSalesModule {}
