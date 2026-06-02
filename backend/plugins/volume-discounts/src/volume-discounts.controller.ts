// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { VolumeDiscountsService } from './volume-discounts.service';
// W4.T9 grandfathered auth primitives — SDK re-export under W4.CI3.
import { JwtAuthGuard } from '../../../src/auth/jwt-auth.guard';
import { RolesGuard } from '../../../src/auth/roles.guard';
import { Roles, Role } from '../../../src/auth/roles.decorator';

@ApiTags('Volume Discounts')
@Controller('volume-discounts')
export class VolumeDiscountsController {
  constructor(private readonly svc: VolumeDiscountsService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Get('product/:productId')
  getForProduct(@Param('productId', ParseIntPipe) productId: number) {
    return this.svc.getForProduct(productId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MERCH)
  create(
    @Body()
    dto: {
      productId?: number;
      categoryId?: number;
      minQty: number;
      discountPct: number;
    },
  ) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MERCH)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    dto: Partial<{ minQty: number; discountPct: number; isActive: boolean }>,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.svc.delete(id);
  }
}
