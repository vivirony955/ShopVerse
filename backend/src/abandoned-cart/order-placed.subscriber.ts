// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { EventBus } from '../common/event-bus.service';
import { AbandonedCartService } from './abandoned-cart.service';

/**
 * Subscribes to `order.placed` so the hourly abandoned-cart reminder
 * cron doesn't email a customer who just completed checkout.
 *
 * Previously the inline `abandonedCartService.clearForUser(userId)`
 * call lived at the bottom of `OrdersService.placeOrder()`. W3.T4
 * moves it to this subscriber so order placement no longer touches
 * AbandonedCartService directly — the event bus owns delivery.
 *
 * Skips guest orders (userId === null) — abandoned-cart snapshots
 * are keyed by user id; there's nothing to clear for guests.
 *
 * The clear is idempotent on the DB side (deleteMany returns 0 if no
 * rows match), so BullMQ retries are harmless. A failure (DB blip)
 * means the worst case is one stale "you left items in your cart"
 * email after a successful order — minor UX glitch, never an order
 * integrity issue.
 */
@Injectable()
export class OrderPlacedAbandonedCartSubscriber
  implements OnApplicationBootstrap
{
  private static readonly PLUGIN_ID = 'kernel.abandoned-cart';
  private readonly logger = new Logger(OrderPlacedAbandonedCartSubscriber.name);

  constructor(
    private readonly bus: EventBus,
    private readonly abandonedCart: AbandonedCartService,
  ) {}

  onApplicationBootstrap(): void {
    this.bus.subscribe(
      'order.placed',
      OrderPlacedAbandonedCartSubscriber.PLUGIN_ID,
      async (event) => {
        if (event.userId === null) return; // guest order — nothing to clear
        await this.abandonedCart.clearForUser(event.userId);
      },
    );
  }
}
