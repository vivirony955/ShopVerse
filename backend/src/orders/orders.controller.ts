// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  Controller,
  Get,
  Post,
  Patch,
  Headers,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  Ip,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { OrdersService } from './orders.service';
import {
  PlaceOrderDto,
  UpdateOrderStatusDto,
  PlaceGuestOrderDto,
} from './dto/order.dto';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // ─── Admin routes first (before :id to avoid collision) ─────────────────────

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.CS_AGENT, Role.SUPER_ADMIN)
  @Get('admin/all')
  getAllOrders(
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.ordersService.getAllOrders({ status, page, limit });
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/:id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateOrderStatus(id, dto.status);
  }

  // ─── User routes ─────────────────────────────────────────────────────────────

  @Get()
  getUserOrders(@Req() req: any) {
    return this.ordersService.getUserOrders(req.user.id);
  }

  @Get(':id')
  getOrder(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.ordersService.getOrderById(req.user.id, id);
  }

  @Post()
  placeOrder(
    @Req() req: any,
    @Body() dto: PlaceOrderDto,
    @Headers('x-device-fingerprint') fingerprint?: string,
  ) {
    const ip = req.ip ?? req.headers['x-forwarded-for'];
    return this.ordersService.placeOrder(req.user.id, dto, {
      ip,
      deviceFingerprint: fingerprint,
    });
  }

  @Patch(':id/cancel')
  cancelOrder(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.ordersService.cancelOrder(req.user.id, id);
  }

  @Patch(':id/return')
  requestReturn(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.ordersService.requestReturn(req.user.id, id);
  }

  // Partial cancellation — user cancels a single item
  @Patch(':id/items/:itemId/cancel')
  cancelItem(
    @Req() req: any,
    @Param('id', ParseIntPipe) orderId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.ordersService.cancelOrderItem(req.user.id, orderId, itemId);
  }

  // Item-level refund — admin only
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/:id/items/:itemId/refund')
  refundItem(
    @Param('id', ParseIntPipe) orderId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() body: { reason?: string } = {},
  ) {
    return this.ordersService.refundOrderItem(
      orderId,
      itemId,
      body.reason as any,
    );
  }

  // FINAL §9.4 M-002: public endpoint — rate-limit to curb card-testing / fake-order abuse.
  // 3 guest orders / IP / 10 min is enough for real shoppers retrying while fraud bots stall.
  @Throttle({ default: { ttl: 600_000, limit: 3 } })
  @Post('guest')
  @HttpCode(HttpStatus.CREATED)
  placeGuestOrder(@Body() dto: PlaceGuestOrderDto, @Ip() ip: string) {
    return this.ordersService.placeGuestOrder({ ...dto, ip });
  }
}
