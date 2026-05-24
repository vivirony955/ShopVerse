// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ExchangeService } from './exchange.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../common/types';

@ApiTags('Exchange')
@ApiBearerAuth('JWT')
@Controller('exchange')
@UseGuards(JwtAuthGuard)
export class ExchangeController {
  constructor(private readonly svc: ExchangeService) {}

  @Post()
  request(
    @CurrentUser() user: AuthUser,
    @Body()
    dto: {
      orderId: number;
      orderItemId: number;
      requestedVariantId: number;
      reason: string;
    },
  ) {
    return this.svc.request(user.id, dto);
  }

  @Get('order/:orderId')
  getForOrder(
    @CurrentUser() user: AuthUser,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.svc.getForOrder(user.id, orderId);
  }

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OPS)
  getAll() {
    return this.svc.getAll();
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OPS)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { status: string; adminNote?: string },
  ) {
    return this.svc.updateStatus(id, dto.status, dto.adminNote);
  }
}
