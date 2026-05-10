// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../prisma/prisma.service';
import { CronLockService } from '../common/cron-lock.service';
import { createPrismaMock, MockPrisma } from '../test-utils/prisma.mock';
import { of, throwError } from 'rxjs';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let prisma: MockPrisma;
  let httpService: jest.Mocked<Pick<HttpService, 'post'>>;

  const mockEndpoint = {
    id: 1,
    url: 'https://example.com/webhook',
    secret: 'a'.repeat(64),
    events: ['order.created', 'payment.success'],
    isActive: true,
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    httpService = { post: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PrismaService, useValue: prisma },
        { provide: HttpService, useValue: httpService },
        {
          provide: CronLockService,
          useValue: {
            acquire: jest.fn().mockResolvedValue(true),
            release: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get<WebhooksService>(WebhooksService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(service).toBeDefined());

  // ─── createEndpoint ───────────────────────────────────────────────────────────

  describe('createEndpoint', () => {
    it('creates endpoint with a generated secret', async () => {
      prisma.webhookEndpoint.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data }),
      );

      const result = await service.createEndpoint({
        url: 'https://example.com/webhook',
        events: ['order.created'],
      });

      expect(result.url).toBe('https://example.com/webhook');
      expect(result.secret).toBeDefined();
      expect(result.secret.length).toBeGreaterThan(0);
    });
  });

  // ─── listEndpoints ────────────────────────────────────────────────────────────

  describe('listEndpoints', () => {
    it('returns all endpoints', async () => {
      prisma.webhookEndpoint.findMany.mockResolvedValue([mockEndpoint]);
      const result = await service.listEndpoints();
      expect(result).toHaveLength(1);
    });
  });

  // ─── updateEndpoint ───────────────────────────────────────────────────────────

  describe('updateEndpoint', () => {
    it('updates endpoint events and active state', async () => {
      prisma.webhookEndpoint.update.mockResolvedValue({
        ...mockEndpoint,
        isActive: false,
        events: ['order.updated'],
      });

      const result = await service.updateEndpoint(1, {
        isActive: false,
        events: ['order.updated'],
      });
      expect(result.isActive).toBe(false);
    });
  });

  // ─── deleteEndpoint ───────────────────────────────────────────────────────────

  describe('deleteEndpoint', () => {
    it('deletes the endpoint', async () => {
      prisma.webhookEndpoint.delete.mockResolvedValue(mockEndpoint);
      await service.deleteEndpoint(1);
      expect(prisma.webhookEndpoint.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });
  });

  // ─── dispatch ─────────────────────────────────────────────────────────────────

  describe('dispatch', () => {
    it('sends webhook to matching endpoints', async () => {
      prisma.webhookEndpoint.findMany.mockResolvedValue([mockEndpoint]);
      prisma.webhookDelivery.create.mockResolvedValue({
        id: 1,
        endpointId: 1,
        attempts: 0,
      });
      prisma.webhookDelivery.update.mockResolvedValue({
        id: 1,
        success: true,
        attempts: 1,
      });

      (httpService.post as jest.Mock).mockReturnValue(
        of({ status: 200, data: 'ok' }),
      );

      await service.dispatch('order.created', { orderId: 42 });

      expect(httpService.post).toHaveBeenCalledWith(
        mockEndpoint.url,
        expect.stringContaining('order.created'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Webhook-Signature': expect.any(String),
          }),
        }),
      );
    });

    it('skips endpoints that do not subscribe to the event', async () => {
      prisma.webhookEndpoint.findMany.mockResolvedValue([
        { ...mockEndpoint, events: ['payment.success'] },
      ]);

      await service.dispatch('order.created', { orderId: 42 });
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('dispatches to wildcard (*) endpoints', async () => {
      prisma.webhookEndpoint.findMany.mockResolvedValue([
        { ...mockEndpoint, events: ['*'] },
      ]);
      prisma.webhookDelivery.create.mockResolvedValue({
        id: 1,
        endpointId: 1,
        attempts: 0,
      });
      prisma.webhookDelivery.update.mockResolvedValue({ id: 1, success: true });

      (httpService.post as jest.Mock).mockReturnValue(of({ status: 200 }));

      await service.dispatch('shipment.updated', { shipmentId: 7 });
      expect(httpService.post).toHaveBeenCalled();
    });

    it('schedules retry on delivery failure', async () => {
      prisma.webhookEndpoint.findMany.mockResolvedValue([mockEndpoint]);
      prisma.webhookDelivery.create.mockResolvedValue({
        id: 1,
        endpointId: 1,
        attempts: 0,
      });
      prisma.webhookDelivery.update.mockResolvedValue({
        id: 1,
        success: false,
        attempts: 1,
      });

      (httpService.post as jest.Mock).mockReturnValue(
        throwError(() => new Error('timeout')),
      );

      await service.dispatch('order.created', { orderId: 42 });

      // delivery update should set nextRetryAt
      expect(prisma.webhookDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ nextRetryAt: expect.any(Date) }),
        }),
      );
    });
  });

  // ─── getDeliveries ────────────────────────────────────────────────────────────

  describe('getDeliveries', () => {
    it('returns deliveries for an endpoint', async () => {
      prisma.webhookDelivery.findMany.mockResolvedValue([
        { id: 1, event: 'order.created', success: true },
        { id: 2, event: 'order.created', success: false },
      ]);
      const result = await service.getDeliveries(1);
      expect(result).toHaveLength(2);
    });
  });
});
