// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, NotFoundException } from '@nestjs/common';
// W4.T9 grandfathered import — PrismaService is kernel infra; SDK
// re-export migration is W4.CI3 (continuous).
import { PrismaService } from '../../../src/prisma/prisma.service';

@Injectable()
export class VolumeDiscountsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: {
    productId?: number;
    categoryId?: number;
    minQty: number;
    discountPct: number;
  }) {
    return this.prisma.volumeDiscount.create({ data: dto });
  }

  async findAll() {
    return this.prisma.volumeDiscount.findMany({
      where: { isActive: true },
      include: {
        product: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
      orderBy: { minQty: 'asc' },
    });
  }

  async getForProduct(productId: number) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Product not found');

    const discounts = await this.prisma.volumeDiscount.findMany({
      where: {
        isActive: true,
        OR: [{ productId }, { categoryId: product.categoryId }],
      },
      orderBy: { minQty: 'asc' },
    });
    return discounts;
  }

  /** Given a quantity, find the best applicable volume discount percentage */
  async getBestDiscount(productId: number, qty: number): Promise<number> {
    const discounts = await this.getForProduct(productId);
    const applicable = discounts.filter((d) => qty >= d.minQty);
    if (!applicable.length) return 0;
    return Math.max(...applicable.map((d) => d.discountPct));
  }

  async update(
    id: number,
    dto: Partial<{ minQty: number; discountPct: number; isActive: boolean }>,
  ) {
    return this.prisma.volumeDiscount.update({ where: { id }, data: dto });
  }

  async delete(id: number) {
    return this.prisma.volumeDiscount.delete({ where: { id } });
  }
}
