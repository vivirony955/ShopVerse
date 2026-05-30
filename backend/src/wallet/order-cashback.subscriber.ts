// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DiscountType } from '@prisma/client';
import { EventBus } from '../common/event-bus.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from './wallet.service';
import { CouponsService } from '../coupons/coupons.service';

/**
 * Subscribes to `order.placed` and credits cashback when the coupon
 * applied to the order is of `CASHBACK` type.
 *
 * Replaces the F4-07 inline block in `OrdersService.placeOrder`. Same
 * semantics — same reference (`order:<id>:cashback`), same credit
 * amount (CouponsService.calcCashback on order.subtotal), same
 * non-fatal failure posture (try/catch swallows, just logs).
 *
 * IDEMPOTENCY (I-12) — `WalletTransaction.reference` is unique per
 * non-auto operation. If BullMQ retries the job after a transient
 * failure, the second credit attempt hits the unique constraint and
 * gets caught here. Net effect: at-most-once credit per order, no
 * double-credit on replay. Same guarantee the inline call had.
 *
 * INVARIANTS PRESERVED
 *   - I-3:  ∑(WalletTransaction.signedAmount) == Wallet.balance per user
 *           (WalletService.credit owns this; we just call it)
 *   - I-12: reference uniqueness (constraint at DB level)
 */
@Injectable()
export class OrderCashbackSubscriber implements OnApplicationBootstrap {
  private static readonly PLUGIN_ID = 'kernel.wallet';
  private readonly logger = new Logger(OrderCashbackSubscriber.name);

  constructor(
    private readonly bus: EventBus,
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly coupons: CouponsService,
  ) {}

  onApplicationBootstrap(): void {
    this.bus.subscribe(
      'order.placed',
      OrderCashbackSubscriber.PLUGIN_ID,
      (event) =>
        this.handleOrderPlaced(event.orderId, event.userId, event.couponCode),
    );
  }

  private async handleOrderPlaced(
    orderId: number,
    userId: number | null,
    couponCode: string | null,
  ): Promise<void> {
    // Cashback is user-only — guest orders have no wallet to credit.
    if (userId === null || !couponCode) return;

    try {
      const [order, coupon] = await Promise.all([
        this.prisma.order.findUnique({
          where: { id: orderId },
          select: { subtotal: true },
        }),
        this.prisma.coupon.findUnique({ where: { code: couponCode } }),
      ]);
      if (!order || !coupon) return;
      if (coupon.discountType !== DiscountType.CASHBACK) return;

      const cashback = this.coupons.calcCashback(coupon, order.subtotal);
      if (cashback <= 0) return;

      await this.wallet.credit({
        userId,
        amount: cashback,
        reference: `order:${orderId}:cashback`,
        description: `Cashback for order #${orderId} (coupon ${couponCode})`,
      });
    } catch (err) {
      // Non-fatal — preserves the original inline behaviour. A failed
      // cashback credit gets logged for ops reconciliation; the order
      // itself was already committed. Idempotency (I-12) means a manual
      // retry from the audit log is safe.
      this.logger.warn(
        `Cashback credit failed for order ${orderId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
