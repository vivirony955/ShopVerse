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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PriceAlertsService } from './price-alerts.service';
import { JwtAuthGuard } from '../../../src/auth/jwt-auth.guard';
import { CurrentUser } from '../../../src/auth/current-user.decorator';
import { AuthUser } from '../../../src/common/types';

/**
 * Plugin REST controller — grandfathered to the bare `/price-alerts`
 * prefix for the W2 pilot. New plugins use `plugin/<id>/...` per the
 * `plugin-route-prefix` lint rule (W1.T8).
 */
@ApiTags('Plugin: Price Alerts')
@ApiBearerAuth('JWT')
@Controller('price-alerts')
@UseGuards(JwtAuthGuard)
export class PriceAlertsController {
  constructor(private readonly svc: PriceAlertsService) {}

  @Post()
  set(
    @CurrentUser() user: AuthUser,
    @Body() dto: { productId: number; targetPrice: number },
  ) {
    return this.svc.set(user.id, dto.productId, dto.targetPrice);
  }

  @Get()
  getAll(@CurrentUser() user: AuthUser) {
    return this.svc.getForUser(user.id);
  }

  @Delete(':productId')
  delete(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.svc.delete(user.id, productId);
  }
}
