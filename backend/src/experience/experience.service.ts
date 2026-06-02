// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddGiftOptionDto,
  CreateDeliverySlotDto,
  SaveForLaterDto,
} from './dto/experience.dto';

@Injectable()
export class ExperienceService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Save for Later ───────────────────────────────────────────────────────

  async saveForLater(userId: number, dto: SaveForLaterDto) {
    return this.prisma.savedForLater.upsert({
      where: { userId_variantId: { userId, variantId: dto.variantId } },
      create: { userId, variantId: dto.variantId },
      update: {},
      include: { variant: { include: { product: true } } },
    });
  }

  async getSavedForLater(userId: number) {
    return this.prisma.savedForLater.findMany({
      where: { userId },
      include: { variant: { include: { product: true } } },
      orderBy: { addedAt: 'desc' },
    });
  }

  async removeSavedForLater(userId: number, variantId: number) {
    return this.prisma.savedForLater.deleteMany({
      where: { userId, variantId },
    });
  }

  /** Move saved item back to cart */
  async moveToCart(userId: number, variantId: number) {
    const saved = await this.prisma.savedForLater.findUnique({
      where: { userId_variantId: { userId, variantId } },
    });
    if (!saved) throw new NotFoundException('Item not in saved list');

    const cart = await this.prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
      create: { cartId: cart.id, variantId, quantity: 1 },
      update: { quantity: { increment: 1 } },
    });

    await this.prisma.savedForLater.delete({
      where: { userId_variantId: { userId, variantId } },
    });

    return { moved: true };
  }

  // ─── Recently Purchased / Buy Again ──────────────────────────────────────

  async recentlyPurchased(userId: number, limit = 10) {
    const items = await this.prisma.orderItem.findMany({
      where: { order: { userId } },
      include: { variant: { include: { product: true } } },
      orderBy: { order: { createdAt: 'desc' } },
      take: limit * 3,
    });

    // Deduplicate by product
    const seen = new Set<number>();
    const unique = items.filter((i) => {
      if (seen.has(i.variant.productId)) return false;
      seen.add(i.variant.productId);
      return true;
    });

    return unique.slice(0, limit);
  }

  // ─── Delivery Slots ───────────────────────────────────────────────────────

  async createSlot(dto: CreateDeliverySlotDto) {
    return this.prisma.deliverySlot.create({
      data: {
        date: new Date(dto.date),
        slotLabel: dto.slotLabel,
        maxOrders: dto.maxOrders ?? 50,
        pincode: dto.pincode,
      },
    });
  }

  async getAvailableSlots(date: string, pincode?: string) {
    return this.prisma.deliverySlot.findMany({
      where: {
        date: {
          gte: new Date(date),
          lt: new Date(new Date(date).getTime() + 7 * 86_400_000), // next 7 days
        },
        isActive: true,
        ...(pincode ? { pincode } : {}),
      },
      orderBy: [{ date: 'asc' }, { slotLabel: 'asc' }],
    });
  }

  async bookSlot(slotId: number) {
    // FINAL §9.4 H-011: atomic conditional increment — prevents overbooking when two
    // customers race for the last slot. The DB, not our read-then-write, enforces capacity.
    const result = await this.prisma.$queryRaw<
      Array<{
        id: number;
        bookedCount: number;
        maxOrders: number;
        isActive: boolean;
      }>
    >`
      UPDATE "DeliverySlot"
      SET "bookedCount" = "bookedCount" + 1
      WHERE id = ${slotId}
        AND "isActive" = true
        AND "bookedCount" < "maxOrders"
      RETURNING id, "bookedCount", "maxOrders", "isActive"
    `;
    if (result.length === 0) {
      // Distinguish "not found" from "full/inactive" for a clearer error.
      const slot = await this.prisma.deliverySlot.findUnique({
        where: { id: slotId },
      });
      if (!slot) throw new NotFoundException('Slot not found');
      if (!slot.isActive) throw new BadRequestException('Slot not available');
      throw new BadRequestException('Slot fully booked');
    }
    return result[0];
  }

  // ─── Gift Options ─────────────────────────────────────────────────────────

  async addGiftOption(dto: AddGiftOptionDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
    });
    if (!order) throw new NotFoundException('Order not found');

    return this.prisma.giftOption.upsert({
      where: { orderId: dto.orderId },
      create: {
        orderId: dto.orderId,
        message: dto.message,
        wrapping: dto.wrapping ?? false,
        recipientName: dto.recipientName,
      },
      update: {
        message: dto.message,
        wrapping: dto.wrapping,
        recipientName: dto.recipientName,
      },
    });
  }

  async getGiftOption(orderId: number) {
    return this.prisma.giftOption.findUnique({ where: { orderId } });
  }

  // ─── F1-04: Recently Viewed ───────────────────────────────────────────────

  async trackRecentlyViewed(userId: number, productId: number) {
    await this.prisma.recentlyViewed.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: { viewedAt: new Date() },
    });
  }

  async getRecentlyViewed(userId: number) {
    const rows = await this.prisma.recentlyViewed.findMany({
      where: { userId },
      orderBy: { viewedAt: 'desc' },
      take: 20,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            basePrice: true,
            discountPct: true,
            images: true,
            brand: { select: { name: true } },
          },
        },
      },
    });
    return rows.map((r) => r.product);
  }

  // ─── F2-13: Delivery Rating ───────────────────────────────────────────────

  async rateDelivery(
    userId: number,
    orderId: number,
    rating: number,
    comment?: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order || order.userId !== userId) throw new Error('Order not found');
    if (order.status !== 'DELIVERED')
      throw new Error('Can only rate delivered orders');
    return this.prisma.deliveryRating.upsert({
      where: { orderId },
      create: { orderId, rating, comment },
      update: { rating, comment },
    });
  }

  async getDeliveryRating(orderId: number) {
    return this.prisma.deliveryRating.findUnique({ where: { orderId } });
  }
}
