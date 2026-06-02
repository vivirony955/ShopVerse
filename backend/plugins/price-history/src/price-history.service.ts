// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Injectable } from '@nestjs/common';
// W4.T5 grandfathered imports — PrismaService and withCronMetric are
// kernel infrastructure; SDK re-export migration is W4.CI3 (continuous).
// The snapshot cron itself is a @Cron decorator on a wrapper class in
// `price-history.module.ts` — the service stays decorator-free for
// testability (Jest specs that exercise `runSnapshot` directly don't
// need the scheduler to be running).
import { PrismaService } from '../../../src/prisma/prisma.service';
import { withCronMetric } from '../../../src/observability/cron-trace';

@Injectable()
export class PriceHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getHistory(productId: number, days = 90) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return this.prisma.priceHistory.findMany({
      where: { productId, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' },
      select: { price: true, discountPct: true, recordedAt: true },
    });
  }

  /**
   * Daily snapshot of every active product's current price + discount.
   * Triggered by the `@Cron` wrapper in PriceHistoryPluginModule (runs
   * at midnight per `EVERY_DAY_AT_MIDNIGHT`). Also registered with the
   * kernel's PluginCronRegistry so `/admin/plugins` lists it under
   * `@shopverse/plugin-price-history:snapshot`.
   */
  async snapshotPrices(): Promise<void> {
    await withCronMetric('price-history-snapshot', () => this.runSnapshot());
  }

  private async runSnapshot(): Promise<void> {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, basePrice: true, discountPct: true },
    });

    // Batch insert in chunks of 500 to avoid oversized queries
    const chunkSize = 500;
    for (let i = 0; i < products.length; i += chunkSize) {
      const chunk = products.slice(i, i + chunkSize);
      await this.prisma.priceHistory.createMany({
        data: chunk.map((p) => ({
          productId: p.id,
          price: p.basePrice,
          discountPct: p.discountPct,
        })),
      });
    }
  }
}
