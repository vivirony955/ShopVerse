// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { EventBus } from '../common/event-bus.service';
import { LoyaltyService } from './loyalty.service';

/**
 * Subscribes to `order.delivered` and earns loyalty points for the
 * delivering user. Replaces the inline `await loyaltyService.earnPoints(
 * userId, orderId, total)` call in `OrdersService.updateOrderStatus`'s
 * DELIVERED branch (FINAL §9.4 R-005 — points are earned on the
 * revenue-recognized basis, i.e., delivery, not placement).
 *
 * IDEMPOTENCY — `LoyaltyService.earnPoints` already gates on a unique
 * `reference = 'earn:order:<orderId>'` constraint (P2002 → no-op return
 * 0). BullMQ retries on a transient failure are safe; the second attempt
 * hits the unique constraint and is swallowed inside the service.
 *
 * GUEST ORDERS — `userId === null` means a guest checkout; no wallet /
 * loyalty account to credit. We skip silently.
 */
@Injectable()
export class OrderDeliveredLoyaltySubscriber implements OnApplicationBootstrap {
  private static readonly PLUGIN_ID = 'kernel.loyalty';
  private readonly logger = new Logger(OrderDeliveredLoyaltySubscriber.name);

  constructor(
    private readonly bus: EventBus,
    private readonly loyalty: LoyaltyService,
  ) {}

  onApplicationBootstrap(): void {
    this.bus.subscribe(
      'order.delivered',
      OrderDeliveredLoyaltySubscriber.PLUGIN_ID,
      (event) =>
        this.handleOrderDelivered(event.orderId, event.userId, event.total),
    );
  }

  private async handleOrderDelivered(
    orderId: number,
    userId: number | null,
    total: number,
  ): Promise<void> {
    if (userId === null) return; // Guest order — no loyalty account.

    try {
      await this.loyalty.earnPoints(userId, orderId, total);
    } catch (err) {
      // earnPoints already swallows P2002 (idempotent no-op). Anything
      // else (DB outage, unexpected error) gets logged for ops triage;
      // the order itself is already in DELIVERED state. Retry is safe
      // because reference uniqueness protects against double-credit.
      this.logger.warn(
        `Loyalty earn failed for order ${orderId} user ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
