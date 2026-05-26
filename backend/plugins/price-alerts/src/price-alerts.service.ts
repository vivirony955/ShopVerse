// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { EmailService } from '../../../src/email/email.service';
import { withCronMetric } from '../../../src/observability/cron-trace';

/**
 * Plugin-owned business logic for price drop alerts.
 *
 * GRANDFATHERED EXCEPTIONS (W2 pilot — documented for cleanup in W3+):
 *   - Imports PrismaService + EmailService + withCronMetric directly
 *     from `../../../src/...` instead of via `@shopverse/sdk`. The SDK
 *     re-exports for these don't exist yet; future plugins use
 *     `kernel.db` / `kernel.events.publishCustom('email.send', ...)` /
 *     a cron context the kernel provides.
 *   - Routes stay at `/api/price-alerts/*` (no `/plugin/` prefix) for
 *     backward compatibility with the integration test's existing
 *     assertions. New plugins use the `/plugin/<id>/...` prefix per
 *     W1.T8 lint rule.
 *
 * Behaviour matches the retired kernel module byte-for-byte — same
 * upserts, same cron schedule, same email fire-and-forget. The change
 * is organisational only: this code now lives in backend/plugins/ and
 * is removable by deleting `PriceAlertsPluginModule` from AppModule.
 */
@Injectable()
export class PriceAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async set(userId: number, productId: number, targetPrice: number) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.priceAlert.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId, targetPrice, isTriggered: false },
      update: { targetPrice, isTriggered: false, triggeredAt: null },
    });
  }

  getForUser(userId: number) {
    return this.prisma.priceAlert.findMany({
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
    return this.prisma.priceAlert.deleteMany({ where: { userId, productId } });
  }

  /** GDPR/DPDP cascade invoked by the user.beforeDelete hook. */
  async deleteAllForUser(userId: number): Promise<void> {
    await this.prisma.priceAlert.deleteMany({ where: { userId } });
  }

  /** Cron entrypoint — wrapped via withCronMetric for OTel + Prom labels. */
  checkAlerts() {
    return withCronMetric('price-alerts-check', () => this.runCheck());
  }

  private async runCheck() {
    const activeAlerts = await this.prisma.priceAlert.findMany({
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
        await this.prisma.priceAlert.update({
          where: { id: alert.id },
          data: { isTriggered: true, triggeredAt: new Date() },
        });
        // Fire-and-forget — alert is genuinely triggered regardless of
        // whether the email actually delivers.
        this.email
          .sendPriceDropAlert(
            alert.user.email,
            alert.user.firstName ?? 'Customer',
            {
              productName: alert.product.name,
              currentPrice: effectivePrice,
              targetPrice: alert.targetPrice,
              slug: alert.product.slug,
            },
          )
          .catch(() => {
            // intentional swallow — see comment above
          });
      }
    }
  }
}
