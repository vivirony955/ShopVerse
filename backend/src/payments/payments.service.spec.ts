// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

// ─── Stripe mock — must be at file top (Jest hoists jest.mock calls) ──────────
jest.mock('stripe', () => ({
  // Provide __esModule so TypeScript's `import Stripe from 'stripe'` resolves to .default
  __esModule: true,
  default: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { WalletService } from '../wallet/wallet.service';
import { InvoicesService } from '../invoices/invoices.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { createPrismaMock, MockPrisma } from '../test-utils/prisma.mock';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: MockPrisma;
  let mockStripeInstance: {
    paymentIntents: { create: jest.Mock; retrieve: jest.Mock; cancel: jest.Mock };
    webhooks: { constructEvent: jest.Mock };
    refunds: { create: jest.Mock };
  };

  const mockEmailService = { sendOrderConfirmation: jest.fn().mockResolvedValue(undefined) };
  const mockWebhooksService = { dispatch: jest.fn().mockResolvedValue(undefined) };
  const mockWalletService = { credit: jest.fn().mockResolvedValue(undefined), debit: jest.fn().mockResolvedValue(undefined) };
  const mockInvoicesService = { createInvoiceRecord: jest.fn().mockResolvedValue(undefined) };
  const mockLoyaltyService = { clawbackPoints: jest.fn().mockResolvedValue(0) };

  beforeEach(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_mock';
    // Create a fresh Stripe-instance mock for each test
    mockStripeInstance = {
      paymentIntents: { create: jest.fn(), retrieve: jest.fn(), cancel: jest.fn() },
      webhooks: { constructEvent: jest.fn() },
      refunds: { create: jest.fn() },
    };
    (Stripe as unknown as jest.Mock).mockImplementation(() => mockStripeInstance);

    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: mockEmailService },
        { provide: WebhooksService, useValue: mockWebhooksService },
        { provide: WalletService, useValue: mockWalletService },
        { provide: InvoicesService, useValue: mockInvoicesService },
        { provide: LoyaltyService, useValue: mockLoyaltyService },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(service).toBeDefined());

  // ─── createPaymentIntent ──────────────────────────────────────────────────────

  describe('createPaymentIntent', () => {
    const order = { id: 1, userId: 1, total: 1500, paymentStatus: 'UNPAID' };

    it('creates a Stripe PaymentIntent and updates the order', async () => {
      prisma.order.findFirst.mockResolvedValue(order);
      mockStripeInstance.paymentIntents.create.mockResolvedValue({
        id: 'pi_test123',
        client_secret: 'cs_test_secret',
      });
      prisma.order.update.mockResolvedValue({ ...order, paymentId: 'pi_test123' });

      const result = await service.createPaymentIntent(1, 1);
      expect(result).toEqual({ clientSecret: 'cs_test_secret', amount: 1500 });
      expect(mockStripeInstance.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 150000, currency: 'inr' }),
        expect.objectContaining({ idempotencyKey: 'order:1' }),
      );
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { paymentId: 'pi_test123' },
      });
    });

    it('uses provided currency', async () => {
      prisma.order.findFirst.mockResolvedValue(order);
      mockStripeInstance.paymentIntents.create.mockResolvedValue({ id: 'pi_2', client_secret: 'cs_2' });
      prisma.order.update.mockResolvedValue({});

      await service.createPaymentIntent(1, 1, 'usd');
      expect(mockStripeInstance.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'usd' }),
        expect.any(Object),
      );
    });

    it('throws NotFoundException when order not found or not owned', async () => {
      prisma.order.findFirst.mockResolvedValue(null);
      await expect(service.createPaymentIntent(1, 99)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when order already paid', async () => {
      prisma.order.findFirst.mockResolvedValue({ ...order, paymentStatus: 'PAID' });
      await expect(service.createPaymentIntent(1, 1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── handleWebhook ────────────────────────────────────────────────────────────

  describe('handleWebhook', () => {
    const rawBody = Buffer.from('{"type":"test"}');
    const signature = 'whsec_test_sig';

    it('returns { received: true } for any handled event', async () => {
      mockStripeInstance.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { metadata: { orderId: '1' } } },
      });
      prisma.order.update.mockResolvedValue({});
      const result = await service.handleWebhook(rawBody, signature);
      expect(result).toEqual({ received: true });
    });

    it('confirms order on payment_intent.succeeded', async () => {
      const pi = { id: 'pi_abc', amount: 50000, metadata: { orderId: '5' } };
      mockStripeInstance.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: pi },
      });
      prisma.order.findUnique.mockResolvedValue({
        id: 5, total: 500, paymentStatus: 'UNPAID',
        user: { id: 1, email: 'a@b.com', firstName: 'Alice' },
        items: [],
      });
      prisma.paymentReconciliation.create.mockResolvedValue({});
      prisma.order.update.mockResolvedValue({});
      prisma.trackingEvent.create.mockResolvedValue({});

      await service.handleWebhook(rawBody, signature);
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ paymentStatus: 'PAID', status: 'CONFIRMED' }) }),
      );
    });

    it('marks order UNPAID on payment_intent.payment_failed', async () => {
      mockStripeInstance.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.payment_failed',
        data: { object: { metadata: { orderId: '5' } } },
      });
      prisma.order.update.mockResolvedValue({});
      await service.handleWebhook(rawBody, signature);
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { paymentStatus: 'UNPAID' },
      });
    });

    it('marks order REFUNDED on charge.refunded', async () => {
      mockStripeInstance.webhooks.constructEvent.mockReturnValue({
        type: 'charge.refunded',
        data: { object: { payment_intent: 'pi_test123' } },
      });
      prisma.order.findMany.mockResolvedValue([{ id: 5, paymentStatus: 'PAID' }]);
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.paymentReconciliation.updateMany.mockResolvedValue({ count: 1 });
      await service.handleWebhook(rawBody, signature);
      expect(prisma.order.updateMany).toHaveBeenCalled();
    });

    it('throws BadRequestException when Stripe signature verification fails', async () => {
      mockStripeInstance.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });
      await expect(service.handleWebhook(rawBody, 'bad-sig')).rejects.toThrow(BadRequestException);
    });

    it('handles unknown event types gracefully (no db call)', async () => {
      mockStripeInstance.webhooks.constructEvent.mockReturnValue({
        type: 'some.unknown.event',
        data: { object: {} },
      });
      const result = await service.handleWebhook(rawBody, signature);
      expect(result).toEqual({ received: true });
      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });
  });
});
