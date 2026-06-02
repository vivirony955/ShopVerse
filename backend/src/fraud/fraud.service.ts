// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BlacklistType,
  FraudFlagStatus,
  FraudFlagType,
  OrderStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddBlacklistDto, FlagFraudDto, ResolveFlagDto } from './dto/fraud.dto';

// Risk score thresholds
const HIGH_RISK_THRESHOLD = 70;
const RETURN_RATE_ABUSE_THRESHOLD = 0.5; // >50% return rate
const COD_CANCEL_RATE_THRESHOLD = 0.4; // >40% COD cancellation rate

@Injectable()
export class FraudService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recompute risk score for a user.
   * Called after each order/return event.
   */
  async computeRiskScore(userId: number): Promise<number> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const orders = await this.prisma.order.findMany({ where: { userId } });
    const totalOrders = orders.length;
    if (totalOrders === 0) return 0;

    const returnedOrders = orders.filter((o) => {
      const returnStatuses: string[] = [
        'RETURNED',
        'RETURN_REQUESTED',
        'REFUNDED',
      ];
      return returnStatuses.includes(o.status);
    }).length;
    const returnRate = returnedOrders / totalOrders;

    const codOrders = orders.filter((o) => o.paymentMethod === 'COD').length;
    const codCancelled = orders.filter(
      (o) => o.paymentMethod === 'COD' && o.status === OrderStatus.CANCELLED,
    ).length;
    const codCancelRate = codOrders > 0 ? codCancelled / codOrders : 0;

    let score = 0;
    if (returnRate > RETURN_RATE_ABUSE_THRESHOLD) score += 40;
    else if (returnRate > 0.3) score += 20;

    if (codCancelRate > COD_CANCEL_RATE_THRESHOLD) score += 30;
    else if (codCancelRate > 0.2) score += 15;

    if (totalOrders < 2 && returnedOrders > 0) score += 10; // new user returning first order

    score = Math.min(score, 100);

    const refundAbuse = returnRate > RETURN_RATE_ABUSE_THRESHOLD;
    const codAbuse = codCancelRate > COD_CANCEL_RATE_THRESHOLD;

    await this.prisma.userRiskScore.upsert({
      where: { userId },
      create: { userId, score, returnRate, refundAbuse, codAbuse },
      update: {
        score,
        returnRate,
        refundAbuse,
        codAbuse,
        lastUpdated: new Date(),
      },
    });

    // Auto-flag high risk users
    if (score >= HIGH_RISK_THRESHOLD) {
      await this.autoFlag(userId, score, refundAbuse, codAbuse);
    }

    return score;
  }

  private async autoFlag(
    userId: number,
    score: number,
    refundAbuse: boolean,
    codAbuse: boolean,
  ) {
    if (refundAbuse) {
      await this.prisma.fraudFlag
        .upsert({
          where: {
            // create unique constraint workaround: check open flags
            id:
              (
                await this.prisma.fraudFlag.findFirst({
                  where: {
                    userId,
                    type: FraudFlagType.HIGH_RETURN_RATE,
                    status: FraudFlagStatus.OPEN,
                  },
                })
              )?.id ?? 0,
          },
          create: {
            userId,
            type: FraudFlagType.HIGH_RETURN_RATE,
            detail: `Auto-flagged: return rate abuse, score ${score}`,
            status: FraudFlagStatus.OPEN,
          },
          update: {},
        })
        .catch(() =>
          this.prisma.fraudFlag.create({
            data: {
              userId,
              type: FraudFlagType.HIGH_RETURN_RATE,
              detail: `Auto-flagged: return rate abuse, score ${score}`,
            },
          }),
        );
    }
    if (codAbuse) {
      await this.prisma.fraudFlag
        .create({
          data: {
            userId,
            type: FraudFlagType.COD_ABUSE,
            detail: `Auto-flagged: COD cancellation abuse, score ${score}`,
          },
        })
        .catch(() => null);
    }
  }

  async addToBlacklist(dto: AddBlacklistDto) {
    return this.prisma.blacklist.upsert({
      where: { type_value: { type: dto.type, value: dto.value } },
      create: { type: dto.type, value: dto.value, reason: dto.reason },
      update: { reason: dto.reason, isActive: true },
    });
  }

  async removeFromBlacklist(type: BlacklistType, value: string) {
    return this.prisma.blacklist.updateMany({
      where: { type, value },
      data: { isActive: false },
    });
  }

  async isBlacklisted(type: BlacklistType, value: string): Promise<boolean> {
    const entry = await this.prisma.blacklist.findFirst({
      where: { type, value, isActive: true },
    });
    return !!entry;
  }

  async flagFraud(dto: FlagFraudDto) {
    return this.prisma.fraudFlag.create({ data: dto });
  }

  async resolveFlag(flagId: number, dto: ResolveFlagDto) {
    return this.prisma.fraudFlag.update({
      where: { id: flagId },
      data: {
        status: dto.status,
        reviewedBy: dto.reviewedBy,
        resolvedAt: new Date(),
      },
    });
  }

  async getOpenFlags() {
    return this.prisma.fraudFlag.findMany({
      where: { status: FraudFlagStatus.OPEN },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUserRiskScore(userId: number) {
    return this.prisma.userRiskScore.findUnique({ where: { userId } });
  }

  async getBlacklist(type?: BlacklistType) {
    return this.prisma.blacklist.findMany({
      where: { isActive: true, ...(type ? { type } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Pre-order fraud gate: checks IP, device fingerprint, and user risk score.
   * Returns { blocked: true, reason } if the request should be denied.
   */
  async preOrderFraudCheck(params: {
    userId: number;
    ip?: string;
    deviceFingerprint?: string;
  }): Promise<{ blocked: boolean; reason?: string }> {
    const checks: Promise<boolean>[] = [];

    if (params.ip) {
      checks.push(this.isBlacklisted(BlacklistType.IP, params.ip));
    }
    if (params.deviceFingerprint) {
      checks.push(
        this.isBlacklisted(BlacklistType.DEVICE, params.deviceFingerprint),
      );
    }
    checks.push(
      this.isBlacklisted(BlacklistType.USER, params.userId.toString()),
    );

    const results = await Promise.all(checks);
    const blacklistedIndex = results.findIndex(Boolean);
    if (blacklistedIndex !== -1) {
      const type =
        blacklistedIndex === 0 && params.ip
          ? 'IP'
          : blacklistedIndex === 1 && params.deviceFingerprint
            ? 'device'
            : 'account';
      return { blocked: true, reason: `Blocked: ${type} is blacklisted` };
    }

    // Check risk score
    const riskRecord = await this.prisma.userRiskScore.findUnique({
      where: { userId: params.userId },
    });
    if (riskRecord && riskRecord.score >= HIGH_RISK_THRESHOLD) {
      return {
        blocked: true,
        reason: `Blocked: high risk score (${riskRecord.score})`,
      };
    }

    return { blocked: false };
  }

  /** T-O01 FIX: IP/device blacklist check for guest orders (no userId/risk score). */
  async preGuestFraudCheck(params: {
    ip?: string;
    deviceFingerprint?: string;
    email?: string;
  }): Promise<{ blocked: boolean; reason?: string }> {
    const checks: Array<Promise<boolean>> = [];
    if (params.ip) checks.push(this.isBlacklisted(BlacklistType.IP, params.ip));
    if (params.deviceFingerprint)
      checks.push(
        this.isBlacklisted(BlacklistType.DEVICE, params.deviceFingerprint),
      );
    if (params.email)
      checks.push(
        this.isBlacklisted(BlacklistType.USER, params.email.toLowerCase()),
      );

    if (checks.length === 0) return { blocked: false };

    const results = await Promise.all(checks);
    const idx = results.findIndex(Boolean);
    if (idx !== -1) {
      const type =
        idx === 0 && params.ip
          ? 'IP'
          : idx === 1 && params.deviceFingerprint
            ? 'device'
            : 'email';
      return { blocked: true, reason: `Blocked: ${type} is blacklisted` };
    }
    return { blocked: false };
  }
}
