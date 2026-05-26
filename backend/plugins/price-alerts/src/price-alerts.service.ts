// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import type { PrismaClient } from '@prisma/client';
import type { KernelContext } from '@shopverse/sdk';
import { PRICE_DROP_TOPIC, type PriceDropEvent } from './index';

/**
 * Plugin-owned business logic. The kernel passes in a typed Prisma
 * handle and the full KernelContext at register time; we close over
 * them rather than using NestJS DI so this class isn't bound to the
 * NestJS runtime.
 *
 * Every db.* call passes through the kernel's plugin-context middleware:
 * - the per-plugin Semaphore enforces concurrency cap
 * - the AsyncLocalStorage frame attributes queries to plugin.id
 * - sync-hook query budget (plan §5 rule #5) is checked when called
 *   from inside a hook
 */
export class PriceAlertsService {
  constructor(
    private readonly db: PrismaClient,
    private readonly kernel: KernelContext,
  ) {}

  async set(userId: number, productId: number, targetPrice: number) {
    const product = await this.db.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }
    return this.db.priceAlert.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId, targetPrice, isTriggered: false },
      update: { targetPrice, isTriggered: false, triggeredAt: null },
    });
  }

  getForUser(userId: number) {
    return this.db.priceAlert.findMany({
      where: { userId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            basePrice: true,
            discountPct: true,
            images: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  delete(userId: number, productId: number) {
    return this.db.priceAlert.deleteMany({ where: { userId, productId } });
  }

  /** GDPR/DPDP cascade — invoked by the user.beforeDelete hook. */
  async deleteAllForUser(userId: number): Promise<void> {
    await this.db.priceAlert.deleteMany({ where: { userId } });
  }

  /**
   * Hourly cron — scan active alerts, mark triggered ones, publish a
   * `price-drop` event for each (the kernel's email worker picks it up
   * via the cross-plugin event bus).
   */
  async checkAlerts(): Promise<void> {
    const activeAlerts = await this.db.priceAlert.findMany({
      where: { isTriggered: false },
      include: {
        product: {
          select: {
            name: true,
            basePrice: true,
            discountPct: true,
            slug: true,
          },
        },
        user: { select: { email: true, firstName: true } },
      },
    });

    for (const alert of activeAlerts) {
      const effectivePrice =
        alert.product.basePrice * (1 - alert.product.discountPct / 100);
      if (effectivePrice <= alert.targetPrice) {
        await this.db.priceAlert.update({
          where: { id: alert.id },
          data: { isTriggered: true, triggeredAt: new Date() },
        });
        // Fire-and-forget — kernel's event bus persists + delivers.
        // Plugin authors don't await event publishes on the cron path
        // because the cron has a 30s budget and email delivery latency
        // shouldn't block it.
        void this.kernel.events.publishCustom<PriceDropEvent>(
          PRICE_DROP_TOPIC,
          {
            userId: alert.userId,
            productId: alert.productId,
            productName: alert.product.name,
            productSlug: alert.product.slug,
            currentPrice: effectivePrice,
            targetPrice: alert.targetPrice,
          },
        );
      }
    }
  }
}
