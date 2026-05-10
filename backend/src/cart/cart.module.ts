import { Module } from '@nestjs/common';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { CartReservationService } from './cart-reservation.service';

@Module({
  controllers: [CartController],
  providers: [CartService, CartReservationService],
  exports: [CartService, CartReservationService],
})
export class CartModule {}
