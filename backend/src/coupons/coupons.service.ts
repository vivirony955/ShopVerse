// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async validateCoupon(code: string, orderAmount: number, userId?: number) {
    const coupon = await this.prisma.coupon.findUnique({ where: { code } });
    if (!coupon || !coupon.isActive) throw new NotFoundException('Invalid or inactive coupon');
    if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new BadRequestException('Coupon has expired');
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      throw new BadRequestException('Coupon usage limit reached');
    }
    if (orderAmount < coupon.minOrderAmount) {
      throw new BadRequestException(`Minimum order amount is ₹${coupon.minOrderAmount}`);
    }
    // T-C02: per-user usage enforcement
    if (userId && coupon.maxUsesPerUser !== null && coupon.maxUsesPerUser !== undefined) {
      const userUsage = await this.prisma.couponUsage.count({
        where: { couponId: coupon.id, userId },
      });
      if (userUsage >= coupon.maxUsesPerUser) {
        throw new BadRequestException('You have reached the usage limit for this coupon');
      }
    }
    // CPN-E09: firstOrderOnly — coupon only valid when user has no prior DELIVERED orders
    if (coupon.firstOrderOnly && userId) {
      const deliveredCount = await this.prisma.order.count({
        where: { userId, status: 'DELIVERED' },
      });
      if (deliveredCount > 0) {
        throw new BadRequestException('This coupon is valid for first-time orders only');
      }
    }
    const discount = this.calcDiscount(coupon, orderAmount);
    return { valid: true, discount, coupon };
  }

  async applyDiscount(code: string, orderAmount: number, userId?: number): Promise<number> {
    const { coupon } = await this.validateCoupon(code, orderAmount, userId);
    return this.calcDiscount(coupon, orderAmount);
  }

  private calcDiscount(coupon: any, amount: number): number {
    // CASHBACK type: discount = 0 upfront (wallet is credited post-order by orders.service)
    if (coupon.discountType === 'CASHBACK') return 0;
    if (coupon.discountType === 'PERCENTAGE') {
      return Math.min((amount * coupon.discountValue) / 100, amount);
    }
    return Math.min(coupon.discountValue, amount);
  }

  /** Returns cashback amount for CASHBACK-type coupons (percentage of order amount) */
  calcCashback(coupon: any, amount: number): number {
    if (coupon.discountType !== 'CASHBACK') return 0;
    // discountValue is a percentage, e.g. 5 means 5% cashback
    return Math.min((amount * coupon.discountValue) / 100, amount);
  }

  findAll() {
    return this.prisma.coupon.findMany();
  }

  create(data: {
    code: string;
    discountType: 'PERCENTAGE' | 'FIXED';
    discountValue: number;
    minOrderAmount?: number;
    maxUses?: number;
    expiresAt?: string;
  }) {
    return this.prisma.coupon.create({
      data: {
        ...data,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      },
    });
  }

  async update(id: number, data: any) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    if (data.expiresAt) data.expiresAt = new Date(data.expiresAt);
    return this.prisma.coupon.update({ where: { id }, data });
  }

  async remove(id: number) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    return this.prisma.coupon.delete({ where: { id } });
  }
}
