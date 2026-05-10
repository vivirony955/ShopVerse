// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import { CreateWarehouseDto, RouteOrderDto, UpdateInventoryDto } from './dto/create-warehouse.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Role, Roles } from '../auth/roles.decorator';
import { ShipmentStatus } from '@prisma/client';

@Controller('warehouse')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class WarehouseController {
  constructor(private readonly svc: WarehouseService) {}

  @Post()
  create(@Body() dto: CreateWarehouseDto) {
    return this.svc.createWarehouse(dto);
  }

  @Get()
  list() {
    return this.svc.listWarehouses();
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getWarehouse(id);
  }

  @Post('inventory')
  updateInventory(@Body() dto: UpdateInventoryDto) {
    return this.svc.updateInventory(dto);
  }

  @Post('route')
  routeOrder(@Body() dto: RouteOrderDto) {
    return this.svc.routeOrder(dto.orderId, dto.deliveryPincode);
  }

  @Patch('shipment/:id/status')
  updateShipment(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: ShipmentStatus,
    @Body('trackingCode') trackingCode?: string,
  ) {
    return this.svc.updateShipmentStatus(id, status, trackingCode);
  }

  @Get('order/:orderId/shipments')
  getShipments(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.svc.getOrderShipments(orderId);
  }

  /** Split an order into sub-orders per warehouse */
  @Post('order/:orderId/split')
  splitOrder(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body('deliveryPincode') deliveryPincode: string,
  ) {
    return this.svc.splitOrderByWarehouse(orderId, deliveryPincode);
  }

  /** Batch pick list for warehouse staff — consolidated by variant */
  @Get(':id/pick-list')
  pickList(
    @Param('id', ParseIntPipe) warehouseId: number,
    @Query('date') date?: string,
  ) {
    return this.svc.getBatchPickList(warehouseId, date);
  }

  /** RTO report for ops team */
  @Get('rto/report')
  rtoReport(@Query('from') from: string, @Query('to') to: string) {
    return this.svc.getRtoReport(new Date(from), new Date(to));
  }
}
