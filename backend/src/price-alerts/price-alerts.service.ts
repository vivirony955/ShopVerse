// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { Cron, CronExpression } from '@nestjs/schedule';

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

  async getForUser(userId: number) {
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

  async delete(userId: number, productId: number) {
    return this.prisma.priceAlert.deleteMany({ where: { userId, productId } });
  }

  // Cron: check every hour if any alert should trigger
  @Cron(CronExpression.EVERY_HOUR)
  async checkAlerts() {
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
        // Fire and forget — non-blocking
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
          .catch(() => {});
      }
    }
  }
}
