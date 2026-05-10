// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

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
