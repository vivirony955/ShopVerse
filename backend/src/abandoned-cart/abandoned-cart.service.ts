// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CronLockService } from '../common/cron-lock.service';
import { withCronMetric } from '../observability/cron-trace';

interface GuestSnapshotItem {
  variantId: number;
  name: string;
  quantity: number;
}

@Injectable()
export class AbandonedCartService {
  private readonly logger = new Logger(AbandonedCartService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly cronLock: CronLockService,
  ) {}

  /**
   * FINAL §9.4 R-013: persist a guest's cart by email when they enter checkout but
   * don't complete. Used by the abandoned-cart reminder job to win back anonymous
   * shoppers (a major conversion surface for guest-heavy traffic).
   */
  async snapshotGuestCart(email: string, items: GuestSnapshotItem[]) {
    if (!email || items.length === 0) return;
    const existing = await this.prisma.abandonedCart.findFirst({
      where: { guestEmail: email, userId: null },
    });
    if (existing) {
      await this.prisma.abandonedCart.update({
        where: { id: existing.id },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: { cartSnapshot: items as any, reminderSentAt: null },
      });
      return;
    }
    await this.prisma.abandonedCart.create({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: { guestEmail: email, cartSnapshot: items as any },
    });
  }

  async snapshotCart(userId: number) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            variant: { include: { product: { select: { name: true } } } },
          },
        },
      },
    });
    if (!cart || cart.items.length === 0) {
      await this.prisma.abandonedCart.deleteMany({ where: { userId } });
      return;
    }
    const snapshot = cart.items.map((i) => ({
      name: i.variant.product.name,
      quantity: i.quantity,
      variantId: i.variantId,
    }));
    await this.prisma.abandonedCart.upsert({
      where: {
        id:
          (await this.prisma.abandonedCart.findFirst({ where: { userId } }))
            ?.id ?? 0,
      },
      update: { cartSnapshot: snapshot, reminderSentAt: null },
      create: { userId, cartSnapshot: snapshot },
    });
  }

  async clearForUser(userId: number) {
    await this.prisma.abandonedCart.deleteMany({ where: { userId } });
  }

  @Cron('0 * * * *') // Every hour
  async sendReminders() {
    await withCronMetric('abandoned-cart-reminders', () =>
      // FINAL §9.4 R-010 / M-005: wrap cron body in distributed lock so only one backend
      // instance sends reminders per tick, even in a multi-replica deployment.
      this.cronLock.runExclusive(
        'abandoned-cart-reminders',
        10 * 60_000,
        async () => {
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          const records = await this.prisma.abandonedCart.findMany({
            where: { reminderSentAt: null, updatedAt: { lte: oneHourAgo } },
            include: { user: { select: { email: true, firstName: true } } },
          });

          for (const record of records) {
            const email = record.user?.email ?? record.guestEmail;
            if (!email) continue;
            type CartItem = { name: string; quantity: number };
            const items = (record.cartSnapshot as CartItem[]).map((i) => ({
              name: i.name,
              quantity: i.quantity,
            }));
            await this.emailService.sendAbandonedCartReminder({
              to: email,
              firstName: record.user?.firstName ?? undefined,
              items,
            });
            await this.prisma.abandonedCart.update({
              where: { id: record.id },
              data: { reminderSentAt: new Date() },
            });
            this.logger.log(`Sent abandoned cart reminder to ${email}`);
          }
        },
      ),
    );
  }
}
