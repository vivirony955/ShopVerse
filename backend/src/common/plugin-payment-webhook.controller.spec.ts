// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { HttpException } from '@nestjs/common';
import type { PaymentGatewayStrategy } from '@shopverse/sdk';
import { PluginPaymentWebhookController } from './plugin-payment-webhook.controller';
import { PluginStrategyRegistry } from './plugin-strategy.registry';

function fakeGateway(id: string): PaymentGatewayStrategy {
  return {
    meta: { id, mode: 'single' },
    webhookPath: `/${id}`,
    createIntent: () =>
      Promise.resolve({ id: 'pi', clientSecret: 'x', gatewayId: id }),
    handleWebhook: () =>
      Promise.resolve({ handled: true, eventType: `${id}.event` }),
  };
}

function reqWithBody(body: string) {
  return {
    rawBody: Buffer.from(body, 'utf8'),
  } as unknown as Parameters<PluginPaymentWebhookController['dispatch']>[1];
}

describe('PluginPaymentWebhookController', () => {
  let registry: PluginStrategyRegistry;
  let controller: PluginPaymentWebhookController;

  beforeEach(() => {
    registry = new PluginStrategyRegistry();
    controller = new PluginPaymentWebhookController(registry);
  });

  it('returns 404 when no gateway is registered', async () => {
    await expect(
      controller.dispatch('razorpay', reqWithBody('{}'), {}),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('always 404 on stripe to defer to kernel route', async () => {
    registry.register('PaymentGatewayStrategy', 'p1', fakeGateway('razorpay'));
    await expect(
      controller.dispatch('stripe', reqWithBody('{}'), {}),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('dispatches to the registered gateway', async () => {
    const gateway = fakeGateway('razorpay');
    const spy = jest.spyOn(gateway, 'handleWebhook');
    registry.register('PaymentGatewayStrategy', 'p1', gateway);

    const result = await controller.dispatch(
      'razorpay',
      reqWithBody('{"event":"payment.captured"}'),
      { 'x-razorpay-signature': 'sig' },
    );

    expect(result).toEqual({ handled: true, eventType: 'razorpay.event' });
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0][0];
    expect(Buffer.isBuffer(arg.rawBody)).toBe(true);
    expect(arg.headers['x-razorpay-signature']).toBe('sig');
  });

  it('returns 404 when gateway id does not match registered impl', async () => {
    registry.register('PaymentGatewayStrategy', 'p1', fakeGateway('razorpay'));
    await expect(
      controller.dispatch('phonepe', reqWithBody('{}'), {}),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
