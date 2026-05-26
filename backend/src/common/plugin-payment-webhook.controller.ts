// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PluginStrategyRegistry } from './plugin-strategy.registry';
import { Public } from '../auth/public.decorator';

/**
 * PluginPaymentWebhookController — plan §10 E22 (W1.T33).
 *
 * Dispatches `/api/payments/webhook/:gatewayId` to the
 * PaymentGatewayStrategy registered under that id. The kernel-owned
 * Stripe webhook lives at the existing /api/payments/webhook/stripe
 * route (in PaymentsModule); plugin-supplied gateways (Razorpay,
 * PhonePe, etc.) plug in via the StrategyRegistry.
 *
 * Routing:
 *   POST /api/payments/webhook/:gatewayId
 *
 * - Looks up the registered PaymentGatewayStrategy whose
 *   `meta.id === gatewayId`
 * - Calls strategy.handleWebhook({ rawBody, headers })
 * - Returns 200 + { handled, eventType } on success
 * - Returns 404 if no gateway is registered for the id
 *
 * The public decorator marks the route as unauthenticated — gateway
 * webhooks authenticate via their own signature schemes which the
 * strategy.handleWebhook validates against `req.rawBody`.
 *
 * Body must come through as `Buffer`. We rely on the existing
 * `rawBodyParser` middleware (already configured for Stripe in main.ts);
 * if not present the rawBody field will be missing and the strategy
 * will reject the request — which is the correct behaviour.
 */

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@ApiTags('Payments')
@Controller('payments/webhook')
export class PluginPaymentWebhookController {
  constructor(private readonly strategies: PluginStrategyRegistry) {}

  @Public()
  @Post(':gatewayId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Plugin-registered payment gateway webhook',
    description:
      'Dispatches the request to the PaymentGatewayStrategy registered for the gatewayId. Returns 404 if no plugin owns that gateway.',
  })
  async dispatch(
    @Param('gatewayId') gatewayId: string,
    @Req() req: RawBodyRequest,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<{ handled: boolean; eventType?: string }> {
    // The Stripe gateway is kernel-owned and bound under
    // /api/payments/webhook/stripe by PaymentsController. Bail out so
    // this generic handler doesn't shadow it.
    if (gatewayId === 'stripe') {
      throw new HttpException(
        'Stripe webhook handled by kernel route, not plugin dispatcher',
        HttpStatus.NOT_FOUND,
      );
    }

    const strategy = this.strategies.getSingle('PaymentGatewayStrategy');
    if (!strategy || strategy.meta.id !== gatewayId) {
      throw new HttpException(
        `No payment gateway registered with id "${gatewayId}"`,
        HttpStatus.NOT_FOUND,
      );
    }

    const rawBody = req.rawBody ?? Buffer.alloc(0);
    // `return await` (not bare `return`) satisfies @typescript-eslint/
    // require-await without changing observable behaviour: Nest awaits
    // the returned Promise either way, and keeping the method genuinely
    // async-aware means the early throws above are surfaced as Promise
    // rejections (matching the spec's `.rejects.toBeInstanceOf(...)`
    // assertions and Nest's standard error-handling path).
    return await strategy.handleWebhook({ rawBody, headers });
  }
}
