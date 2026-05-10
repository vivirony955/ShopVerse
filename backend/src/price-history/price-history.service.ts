import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';

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

  // Daily snapshot — runs at midnight
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async snapshotPrices() {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, basePrice: true, discountPct: true },
    });

    // Batch insert in chunks of 500 to avoid oversized queries
    const chunkSize = 500;
    for (let i = 0; i < products.length; i += chunkSize) {
      const chunk = products.slice(i, i + chunkSize);
      await this.prisma.priceHistory.createMany({
        data: chunk.map(p => ({
          productId: p.id,
          price: p.basePrice,
          discountPct: p.discountPct,
        })),
      });
    }
  }
}
