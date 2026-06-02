// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PriceHistoryService } from './price-history.service';

@ApiTags('Price History')
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
