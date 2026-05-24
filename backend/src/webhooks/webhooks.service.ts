// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEndpointDto, UpdateEndpointDto } from './dto/webhook.dto';
import { createHmac, randomBytes } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CronLockService } from '../common/cron-lock.service';
import { withCronMetric } from '../observability/cron-trace';

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [30_000, 60_000, 300_000, 900_000, 3_600_000];

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly cronLock: CronLockService,
  ) {}

  async createEndpoint(dto: CreateEndpointDto) {
    const secret = randomBytes(32).toString('hex');
    return this.prisma.webhookEndpoint.create({
      data: { url: dto.url, secret, events: dto.events },
    });
  }

  async updateEndpoint(id: number, dto: UpdateEndpointDto) {
    return this.prisma.webhookEndpoint.update({
      where: { id },
      data: dto,
    });
  }

  async deleteEndpoint(id: number) {
    return this.prisma.webhookEndpoint.delete({ where: { id } });
  }

  async listEndpoints() {
    return this.prisma.webhookEndpoint.findMany();
  }

  /**
   * Dispatch an event to all matching active endpoints.
   * Signs the payload with HMAC-SHA256.
   */
  async dispatch(event: string, payload: object) {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { isActive: true },
    });

    const matching = endpoints.filter(
      (ep) => ep.events.includes(event) || ep.events.includes('*'),
    );

    for (const ep of matching) {
      const body = JSON.stringify({
        event,
        data: payload,
        timestamp: Date.now(),
      });
      const signature = createHmac('sha256', ep.secret)
        .update(body)
        .digest('hex');

      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          endpointId: ep.id,
          event,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          payload: payload as any,
          attempts: 0,
        },
      });

      await this.deliver(delivery.id, ep.url, body, signature);
    }
  }

  private async deliver(
    deliveryId: number,
    url: string,
    body: string,
    signature: string,
  ) {
    try {
      const response = await firstValueFrom(
        this.http.post(url, body, {
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
          },
          timeout: 10_000,
        }),
      );

      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          responseCode: response.status,
          attempts: { increment: 1 },
          success: true,
          nextRetryAt: null,
        },
      });
    } catch (err: unknown) {
      const delivery = await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          responseCode:
            (err as { response?: { status?: number } })?.response?.status ??
            null,
          attempts: { increment: 1 },
          success: false,
        },
      });

      if (delivery.attempts < MAX_ATTEMPTS) {
        const delay = RETRY_DELAYS_MS[delivery.attempts - 1] ?? 3_600_000;
        await this.prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: { nextRetryAt: new Date(Date.now() + delay) },
        });
      }
    }
  }

  /** Retry failed deliveries — runs every minute */
  @Cron(CronExpression.EVERY_MINUTE)
  async retryFailed() {
    // A2 observability: trace + metric the retry cycle.
    await withCronMetric('webhook-retry-failed', () =>
      // FINAL §9.4 R-010 / M-005: prevent double-sending from concurrent replicas.
      this.cronLock.runExclusive('webhook-retry-failed', 55_000, async () => {
        const due = await this.prisma.webhookDelivery.findMany({
          where: {
            success: false,
            nextRetryAt: { lte: new Date() },
            attempts: { lt: MAX_ATTEMPTS },
          },
          include: { endpoint: true },
          take: 50,
        });

        for (const delivery of due) {
          const body = JSON.stringify({
            event: delivery.event,
            data: delivery.payload,
            timestamp: Date.now(),
          });
          const signature = createHmac('sha256', delivery.endpoint.secret)
            .update(body)
            .digest('hex');
          await this.deliver(
            delivery.id,
            delivery.endpoint.url,
            body,
            signature,
          );
        }

        if (due.length > 0)
          this.logger.log(`Retried ${due.length} webhook deliveries`);
      }),
    );
  }

  async getDeliveries(endpointId: number) {
    return this.prisma.webhookDelivery.findMany({
      where: { endpointId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
