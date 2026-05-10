// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const POINTS_PER_RUPEE = 0.1; // 1 point per ₹10 spent
const POINT_VALUE = 0.5; // Each point = ₹0.50
// FINAL §9.4 M-003: cap redemption at 20% of order subtotal to protect margin.
const MAX_REDEEM_PCT_OF_SUBTOTAL = 0.2;

@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalance(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { loyaltyPoints: true },
    });
    return {
      points: user?.loyaltyPoints ?? 0,
      valueInRupees: (user?.loyaltyPoints ?? 0) * POINT_VALUE,
    };
  }

  getHistory(userId: number) {
    return this.prisma.loyaltyTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Idempotent earn. Called on delivery (FINAL §9.4 R-005). Safe to retry: the unique
   * `reference` constraint ensures at-most-once credit per order.
   */
  async earnPoints(userId: number, orderId: number, orderTotal: number) {
    const points = Math.floor(orderTotal * POINTS_PER_RUPEE);
    if (points <= 0) return 0;
    const reference = `earn:order:${orderId}`;
    try {
      await this.prisma.$transaction([
        this.prisma.loyaltyTransaction.create({
          data: {
            userId,
            orderId,
            points,
            type: 'EARN',
            note: `Earned on order #${orderId}`,
            reference,
          },
        }),
        this.prisma.user.update({
          where: { id: userId },
          data: { loyaltyPoints: { increment: points } },
        }),
      ]);
      return points;
    } catch (e) {
      // P2002 = unique violation on `reference` → already credited. Idempotent no-op.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        return 0;
      throw e;
    }
  }

  /**
   * Redeem points for discount. Balance check is performed INSIDE the transaction
   * with a row-level lock via raw UPDATE to prevent double-spend races (FINAL §9.4 C-008).
   * If `orderSubtotal` is provided, redemption is capped at MAX_REDEEM_PCT_OF_SUBTOTAL (M-003).
   */
  async redeemPoints(
    userId: number,
    pointsToRedeem: number,
    orderSubtotal?: number,
  ): Promise<number> {
    if (pointsToRedeem <= 0)
      throw new BadRequestException('Points to redeem must be positive');

    // Enforce max-redeem cap when order subtotal is known.
    if (orderSubtotal != null) {
      const maxDiscount = orderSubtotal * MAX_REDEEM_PCT_OF_SUBTOTAL;
      const maxPoints = Math.floor(maxDiscount / POINT_VALUE);
      if (pointsToRedeem > maxPoints) {
        throw new BadRequestException(
          `Can redeem at most ${maxPoints} points (${MAX_REDEEM_PCT_OF_SUBTOTAL * 100}% of order)`,
        );
      }
    }

    const discountAmount = pointsToRedeem * POINT_VALUE;

    return this.prisma.$transaction(async (tx) => {
      // Conditional decrement: only succeeds if current balance ≥ pointsToRedeem.
      // Returns the updated row, or throws if no row matched (P2025).
      const updated = await tx.user.updateMany({
        where: { id: userId, loyaltyPoints: { gte: pointsToRedeem } },
        data: { loyaltyPoints: { decrement: pointsToRedeem } },
      });
      if (updated.count === 0) {
        throw new BadRequestException('Insufficient loyalty points');
      }
      await tx.loyaltyTransaction.create({
        data: {
          userId,
          points: -pointsToRedeem,
          type: 'REDEEM',
          note: `Redeemed for ₹${discountAmount} discount`,
        },
      });
      return discountAmount;
    });
  }

  /**
   * V-08 FIX: Clawback earned points when an order is refunded.
   * Idempotent — reference `clawback:order:${orderId}` unique constraint prevents double clawback.
   * No-ops if no earn transaction exists (order was never delivered / no points were earned).
   */
  async clawbackPoints(userId: number, orderId: number) {
    const earnTx = await this.prisma.loyaltyTransaction.findFirst({
      where: { userId, orderId, type: 'EARN' },
      select: { points: true },
    });
    if (!earnTx || earnTx.points <= 0) return 0;

    const reference = `clawback:order:${orderId}`;
    try {
      await this.prisma.$transaction([
        this.prisma.loyaltyTransaction.create({
          data: {
            userId,
            orderId,
            points: -earnTx.points,
            type: 'CLAWBACK',
            note: `Points clawed back on refund of order #${orderId}`,
            reference,
          },
        }),
        // GREATEST(0, balance - points): prevent negative balance if already spent
        this.prisma.$executeRaw`
          UPDATE "User" SET "loyaltyPoints" = GREATEST(0, "loyaltyPoints" - ${earnTx.points})
          WHERE "id" = ${userId}
        `,
      ]);
      return earnTx.points;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        return 0;
      throw e;
    }
  }

  async addBonus(
    userId: number,
    points: number,
    note: string,
    reference?: string,
  ) {
    try {
      await this.prisma.$transaction([
        this.prisma.loyaltyTransaction.create({
          data: { userId, points, type: 'REFERRAL_BONUS', note, reference },
        }),
        this.prisma.user.update({
          where: { id: userId },
          data: { loyaltyPoints: { increment: points } },
        }),
      ]);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        return;
      throw e;
    }
  }
}
