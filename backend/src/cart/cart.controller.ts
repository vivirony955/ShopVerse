// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CartService } from './cart.service';
import { CartReservationService } from './cart-reservation.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(
    private readonly cartService: CartService,
    private readonly reservationService: CartReservationService,
  ) {}

  @Get()
  getCart(@Req() req: any) {
    return this.cartService.getCart(req.user.id);
  }

  @Post('items')
  addItem(@Req() req: any, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(req.user.id, dto.variantId, dto.quantity);
  }

  @Patch('items/:id')
  updateItem(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(req.user.id, id, dto.quantity);
  }

  @Delete('items/:id')
  removeItem(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.cartService.removeItem(req.user.id, id);
  }

  @Delete()
  clearCart(@Req() req: any) {
    return this.cartService.clearCart(req.user.id);
  }

  // ─── Reservation endpoints ────────────────────────────────────────────────────

  /** Lock cart items + prices for the checkout window. Returns reservationId. */
  @Post('reserve')
  async reserveCart(@Req() req: any) {
    return this.reservationService.createReservation(req.user.id);
  }

  /** Release reservation (on checkout cancel) */
  @Delete('reserve/:id')
  async releaseReservation(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.reservationService.releaseById(id, req.user.id);
    return { message: 'Reservation released' };
  }

  /** Check if user still has a valid active reservation */
  @Get('reserve/status')
  getReservationStatus(@Req() req: any) {
    return this.reservationService
      .hasValidReservation(req.user.id)
      .then((valid) => ({ valid }));
  }
}
