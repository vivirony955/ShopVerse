// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PriceAlertsService } from './price-alerts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('price-alerts')
@UseGuards(JwtAuthGuard)
export class PriceAlertsController {
  constructor(private readonly svc: PriceAlertsService) {}

  @Post()
  set(
    @CurrentUser() user: any,
    @Body() dto: { productId: number; targetPrice: number },
  ) {
    return this.svc.set(user.id, dto.productId, dto.targetPrice);
  }

  @Get()
  getAll(@CurrentUser() user: any) {
    return this.svc.getForUser(user.id);
  }

  @Delete(':productId')
  delete(
    @CurrentUser() user: any,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.svc.delete(user.id, productId);
  }
}
