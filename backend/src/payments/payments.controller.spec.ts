// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

describe('PaymentsController', () => {
  let controller: PaymentsController;

  const mockPaymentsService = {
    createPaymentIntent: jest.fn(),
    handleWebhook: jest.fn(),
  };

  const mockReq = { user: { id: 1 }, rawBody: Buffer.from('{}') };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: mockPaymentsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(controller).toBeDefined());

  describe('createPaymentIntent', () => {
    it('creates a payment intent for the current user', async () => {
      const response = { clientSecret: 'cs_test', amount: 1500 };
      mockPaymentsService.createPaymentIntent.mockResolvedValue(response);
      const result = await controller.createPaymentIntent(mockReq, { orderId: 1 });
      expect(result).toEqual(response);
      expect(mockPaymentsService.createPaymentIntent).toHaveBeenCalledWith(1, 1, undefined);
    });

    it('passes currency to service when provided', async () => {
      mockPaymentsService.createPaymentIntent.mockResolvedValue({ clientSecret: 'cs', amount: 500 });
      await controller.createPaymentIntent(mockReq, { orderId: 2, currency: 'usd' });
      expect(mockPaymentsService.createPaymentIntent).toHaveBeenCalledWith(1, 2, 'usd');
    });
  });

  describe('handleWebhook', () => {
    it('forwards raw body and signature to service', async () => {
      mockPaymentsService.handleWebhook.mockResolvedValue({ received: true });
      const result = await controller.handleWebhook(mockReq as any, 'whsec_sig');
      expect(result).toEqual({ received: true });
      expect(mockPaymentsService.handleWebhook).toHaveBeenCalledWith(
        mockReq.rawBody, 'whsec_sig',
      );
    });
  });
});
