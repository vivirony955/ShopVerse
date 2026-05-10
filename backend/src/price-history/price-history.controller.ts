// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { PriceHistoryService } from './price-history.service';

@Controller('price-history')
export class PriceHistoryController {
  constructor(private readonly svc: PriceHistoryService) {}

  @Get(':productId')
  getHistory(
    @Param('productId', ParseIntPipe) productId: number,
    @Query('days') days?: number,
  ) {
    return this.svc.getHistory(productId, days ? Number(days) : 90);
  }
}
