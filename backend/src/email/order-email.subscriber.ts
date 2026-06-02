// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { EventBus } from '../common/event-bus.service';
import { EmailService } from './email.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Subscribes to kernel events that should trigger transactional emails.
 *
 * Currently:
 *   - `order.placed` → fetch full order + send confirmation email
 *
 * Previously the inline `emailService.sendOrderConfirmation(order)` call
 * lived at the bottom of `OrdersService.placeOrder()`. W3.T2 moves it
 * here so order placement no longer touches EmailService directly —
 * the event-bus owns delivery.
 *
 * One extra Prisma read per order placement (the event payload carries
 * only the order id; we re-fetch with the includes EmailService
 * requires). Net latency change is ~0 because in the OLD inline code,
 * we ALREADY held the full order object in memory from the placeOrder
 * transaction; only the cron / worker path triggers an extra read,
 * which is the path we want isolated from the request anyway.
 *
 * Handler errors bubble to BullMQ, which retries per the queue's
 * defaultJobOptions (5 attempts + exp backoff). Idempotent on the
 * SMTP side because the email body carries the order id and SMTP
 * providers de-duplicate by Message-ID.
 */
@Injectable()
export class OrderEmailSubscriber implements OnApplicationBootstrap {
  private static readonly PLUGIN_ID = 'kernel.email';
  private readonly logger = new Logger(OrderEmailSubscriber.name);

  constructor(
    private readonly bus: EventBus,
    private readonly email: EmailService,
    private readonly prisma: PrismaService,
  ) {}

  onApplicationBootstrap(): void {
    this.bus.subscribe(
      'order.placed',
      OrderEmailSubscriber.PLUGIN_ID,
      (event) => this.handleOrderPlaced(event.orderId),
    );
  }

  private async handleOrderPlaced(orderId: number): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { email: true, firstName: true } },
        items: {
          include: {
            variant: { include: { product: { select: { name: true } } } },
          },
        },
      },
    });
    if (!order) {
      this.logger.warn(
        `order.placed handler — order ${orderId} not found, skipping email`,
      );
      return;
    }
    await this.email.sendOrderConfirmation(order);
  }
}
