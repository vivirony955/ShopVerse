// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { EmailService } from '../email/email.service';

const REFERRER_BONUS_POINTS = 200;
const REFEREE_BONUS_POINTS = 100;

@Injectable()
export class ReferralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyaltyService: LoyaltyService,
    private readonly emailService: EmailService,
  ) {}

  async generateCode(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.referralCode) return { referralCode: user.referralCode, referralCount: 0 };
    const code = `SV-${userId}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await this.prisma.user.update({
      where: { id: userId },
      data: { referralCode: code },
    });
    return { referralCode: code, referralCount: 0 };
  }

  async getMyCode(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        referralCode: true,
        loyaltyPoints: true,
        referrals: { select: { id: true, createdAt: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.referralCode) return this.generateCode(userId);
    return {
      referralCode: user.referralCode,
      referralCount: user.referrals.length,
    };
  }

  /**
   * Record the referral link between referrer and new user. Does NOT yet pay out the
   * bonus — that happens in `creditOnFirstDelivery()` once the referee has ≥1 delivered
   * order (FINAL §9.4 H-009). This closes the fraud loophole where signups alone triggered
   * payouts.
   */
  async applyReferral(newUserId: number, referralCode: string) {
    const referrer = await this.prisma.user.findUnique({
      where: { referralCode },
    });
    if (!referrer) throw new NotFoundException('Invalid referral code');
    if (referrer.id === newUserId)
      throw new BadRequestException('Cannot use your own referral code');

    const existing = await this.prisma.referralCredit.findUnique({
      where: { newUserId },
    });
    if (existing) throw new BadRequestException('Referral already applied');

    await this.prisma.$transaction([
      this.prisma.referralCredit.create({
        data: {
          referrerId: referrer.id,
          newUserId,
          creditAmount: REFERRER_BONUS_POINTS,
        },
      }),
      this.prisma.user.update({
        where: { id: newUserId },
        data: { referredById: referrer.id },
      }),
    ]);

    return {
      message: 'Referral linked — bonus credits on first delivered order',
      bonusPoints: REFEREE_BONUS_POINTS,
    };
  }

  /**
   * Called from OrdersService when an order transitions to DELIVERED. Idempotent via
   * LoyaltyTransaction.reference. Only pays out the first time and only if this user
   * was referred by someone.
   */
  async creditOnFirstDelivery(newUserId: number): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: newUserId },
      select: { id: true, referredById: true },
    });
    if (!user?.referredById) return false;

    // Count delivered orders for this user. We only pay out on the first.
    const deliveredCount = await this.prisma.order.count({
      where: { userId: newUserId, status: 'DELIVERED' },
    });
    if (deliveredCount !== 1) return false;

    const referrer = await this.prisma.user.findUnique({
      where: { id: user.referredById },
      select: { id: true, email: true, firstName: true },
    });
    if (!referrer) return false;

    const refererRef = `referral:referrer:${user.referredById}:referee:${newUserId}`;
    const refereeRef = `referral:referee:${newUserId}`;

    await Promise.all([
      this.loyaltyService.addBonus(
        referrer.id,
        REFERRER_BONUS_POINTS,
        `Referral bonus for inviting user #${newUserId}`,
        refererRef,
      ),
      this.loyaltyService.addBonus(
        newUserId,
        REFEREE_BONUS_POINTS,
        `Referral signup bonus`,
        refereeRef,
      ),
      this.emailService
        .sendReferralBonus({
          to: referrer.email,
          firstName: referrer.firstName ?? undefined,
          points: REFERRER_BONUS_POINTS,
        })
        .catch(() => {}),
    ]);
    return true;
  }
}
