// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import {
  Controller,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
  Headers,
  RawBodyRequest,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiExcludeEndpoint } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';
import { CreatePaymentIntentDto } from './dto/payment.dto';
import { AuthenticatedRequest } from '../common/types';
import { Request } from 'express';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // 20 intent creations per minute per user (prevents accidental spam)
  @ApiBearerAuth('JWT')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseGuards(JwtAuthGuard)
  @Post('create-intent')
  createPaymentIntent(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreatePaymentIntentDto,
  ) {
    return this.paymentsService.createPaymentIntent(
      req.user.id,
      dto.orderId,
      dto.currency,
    );
  }

  // 5 retries per minute — prevent retry spam
  @ApiBearerAuth('JWT')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @UseGuards(JwtAuthGuard)
  @Post('retry/:orderId')
  retryPayment(
    @Req() req: AuthenticatedRequest,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body('currency') currency?: string,
  ) {
    return this.paymentsService.retryPayment(req.user.id, orderId, currency);
  }

  // Refund to original payment method (Stripe card)
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard)
  @Post('refund/:orderId')
  refundStripePayment(
    @Req() req: AuthenticatedRequest,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.paymentsService.refundStripePayment(orderId, req.user.id);
  }

  // Stripe webhook — must receive raw body, NO JwtAuthGuard, NO rate limit.
  // Hidden from OpenAPI spec: it's not user-callable and the signature
  // header semantics aren't representable in OpenAPI cleanly.
  @ApiExcludeEndpoint()
  @SkipThrottle()
  @Post('webhook')
  handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.paymentsService.handleWebhook(
      req.rawBody ?? Buffer.alloc(0),
      signature,
    );
  }
}
