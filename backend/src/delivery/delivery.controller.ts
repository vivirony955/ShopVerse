// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Controller, Get, Post, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DeliveryService } from './delivery.service';
import { UpsertPincodeDto } from './dto/delivery.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Role, Roles } from '../auth/roles.decorator';

@ApiTags('Delivery')
@Controller('delivery')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get('check')
  check(@Query('pincode') pincode: string, @Query('country') country?: string) {
    return this.deliveryService.check(pincode, country);
  }

  @Get('pincodes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findAll() {
    return this.deliveryService.findAll();
  }

  @Post('pincodes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  upsert(@Body() dto: UpsertPincodeDto) {
    return this.deliveryService.upsert(dto);
  }
}
