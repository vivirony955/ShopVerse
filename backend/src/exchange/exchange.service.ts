// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExchangeService {
  constructor(private readonly prisma: PrismaService) {}

  async request(
    userId: number,
    dto: {
      orderId: number;
      orderItemId: number;
      requestedVariantId: number;
      reason: string;
    },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException();
    if (!['DELIVERED'].includes(order.status))
      throw new BadRequestException(
        'Exchange only allowed for delivered orders',
      );

    const item = order.items.find((i) => i.id === dto.orderItemId);
    if (!item) throw new NotFoundException('Order item not found');

    const existing = await this.prisma.exchangeRequest.findFirst({
      where: { orderItemId: dto.orderItemId },
    });
    if (existing)
      throw new BadRequestException('Exchange already requested for this item');

    const variant = await this.prisma.variant.findUnique({
      where: { id: dto.requestedVariantId },
    });
    if (
      !variant ||
      variant.productId !==
        (await this.prisma.variant.findUnique({
          where: { id: item.variantId },
        }))!.productId
    ) {
      throw new BadRequestException(
        'Replacement must be a variant of the same product',
      );
    }

    return this.prisma.exchangeRequest.create({
      data: {
        orderId: dto.orderId,
        orderItemId: dto.orderItemId,
        requestedVariantId: dto.requestedVariantId,
        reason: dto.reason,
      },
    });
  }

  async getForOrder(userId: number, orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order || order.userId !== userId) throw new ForbiddenException();
    return this.prisma.exchangeRequest.findMany({
      where: { orderId },
      include: {
        requestedVariant: { include: { product: { select: { name: true } } } },
      },
    });
  }

  async getAll() {
    return this.prisma.exchangeRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        order: { select: { id: true, userId: true } },
        requestedVariant: { include: { product: { select: { name: true } } } },
      },
    });
  }

  async updateStatus(id: number, status: string, adminNote?: string) {
    return this.prisma.exchangeRequest.update({
      where: { id },
      data: { status: status as any, adminNote },
    });
  }
}
