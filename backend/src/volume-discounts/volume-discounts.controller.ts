import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { VolumeDiscountsService } from './volume-discounts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';

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
  create(@Body() dto: { productId?: number; categoryId?: number; minQty: number; discountPct: number }) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MERCH)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.svc.delete(id);
  }
}
