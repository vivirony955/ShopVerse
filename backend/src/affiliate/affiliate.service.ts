// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttributionType, LedgerType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAffiliateDto, TrackAttributionDto } from './dto/affiliate.dto';
import { randomBytes } from 'crypto';

@Injectable()
export class AffiliateService {
  constructor(private readonly prisma: PrismaService) {}

  async createAccount(dto: CreateAffiliateDto) {
    const existing = await this.prisma.affiliateAccount.findUnique({
      where: { userId: dto.userId },
    });
    if (existing)
      throw new BadRequestException('Affiliate account already exists');

    const code = randomBytes(4).toString('hex').toUpperCase();
    return this.prisma.affiliateAccount.create({
      data: { userId: dto.userId, code, commissionPct: dto.commissionPct ?? 5 },
    });
  }

  async getAccount(userId: number) {
    const account = await this.prisma.affiliateAccount.findUnique({
      where: { userId },
      include: { attributions: { orderBy: { createdAt: 'desc' }, take: 50 } },
    });
    if (!account) throw new NotFoundException('Affiliate account not found');
    return account;
  }

  async trackAttribution(dto: TrackAttributionDto) {
    let affiliateId: number | undefined;
    let commissionAmount = 0;

    if (dto.affiliateCode) {
      const affiliate = await this.prisma.affiliateAccount.findUnique({
        where: { code: dto.affiliateCode },
      });
      if (affiliate && affiliate.isActive) {
        affiliateId = affiliate.id;

        if (dto.orderId) {
          const order = await this.prisma.order.findUnique({
            where: { id: dto.orderId },
          });
          if (order) {
            commissionAmount = (order.total * affiliate.commissionPct) / 100;
            // Credit total earned
            await this.prisma.affiliateAccount.update({
              where: { id: affiliate.id },
              data: { totalEarned: { increment: commissionAmount } },
            });
          }
        }
      }
    }

    return this.prisma.campaignAttribution.create({
      data: {
        affiliateId,
        orderId: dto.orderId,
        utmSource: dto.utmSource,
        utmMedium: dto.utmMedium,
        utmCampaign: dto.utmCampaign,
        utmContent: dto.utmContent,
        attributionType: dto.attributionType ?? AttributionType.LAST_TOUCH,
        commissionAmount,
      },
    });
  }

  async getAttributionsByAffiliate(affiliateId: number) {
    return this.prisma.campaignAttribution.findMany({
      where: { affiliateId },
      include: { order: { select: { id: true, total: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCampaignReport(utmCampaign: string) {
    const attributions = await this.prisma.campaignAttribution.findMany({
      where: { utmCampaign },
      include: { order: { select: { id: true, total: true, status: true } } },
    });
    const totalRevenue = attributions.reduce(
      (sum, a) => sum + (a.order?.total ?? 0),
      0,
    );
    const totalCommission = attributions.reduce(
      (sum, a) => sum + (a.commissionAmount ?? 0),
      0,
    );
    return {
      campaign: utmCampaign,
      conversions: attributions.length,
      totalRevenue,
      totalCommission,
      attributions,
    };
  }

  async listAccounts() {
    return this.prisma.affiliateAccount.findMany({
      include: { user: { select: { id: true, email: true, firstName: true } } },
      orderBy: { totalEarned: 'desc' },
    });
  }

  /**
   * Process pending commission payouts for all affiliates.
   * Creates a LedgerEntry (debit from platform) and wallet credit for each affiliate.
   * Idempotent: skips affiliates with no pending payout.
   */
  async processPendingPayouts() {
    const accounts = await this.prisma.affiliateAccount.findMany({
      where: { isActive: true },
      include: { user: true },
    });

    const results: { affiliateId: number; paid: number }[] = [];

    for (const account of accounts) {
      const pendingPayout = account.totalEarned - account.totalPaid;
      if (pendingPayout <= 0) continue;

      const ref = `affiliate_payout_${account.id}_${Date.now()}`;

      await this.prisma.$transaction(async (tx) => {
        // Debit platform ledger
        await tx.ledgerEntry.create({
          data: {
            type: LedgerType.COMMISSION_PAYOUT,
            debitAmount: pendingPayout,
            reference: ref,
            description: `Commission payout to affiliate #${account.id} (${account.user?.email ?? ''})`,
          },
        });

        // Credit affiliate's wallet
        const wallet = await tx.wallet.upsert({
          where: { userId: account.userId },
          create: { userId: account.userId, balance: pendingPayout },
          update: { balance: { increment: pendingPayout } },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            amount: pendingPayout,
            type: 'CREDIT',
            reference: ref,
            description: `Affiliate commission payout`,
            balanceAfter: wallet.balance,
          },
        });

        // Mark payout recorded
        await tx.affiliateAccount.update({
          where: { id: account.id },
          data: { totalPaid: { increment: pendingPayout } },
        });
      });

      results.push({ affiliateId: account.id, paid: pendingPayout });
    }

    return { processed: results.length, payouts: results };
  }

  /** Get payout summary for a single affiliate */
  async getPayoutSummary(userId: number) {
    const account = await this.prisma.affiliateAccount.findUnique({
      where: { userId },
    });
    if (!account) throw new NotFoundException('Affiliate account not found');
    return {
      totalEarned: account.totalEarned,
      totalPaid: account.totalPaid,
      pendingPayout: account.totalEarned - account.totalPaid,
    };
  }
}
