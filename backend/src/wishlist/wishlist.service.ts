// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  getWishlist(userId: number) {
    return this.prisma.wishlist.findMany({
      where: { userId },
      include: {
        product: {
          include: {
            brand: { select: { id: true, name: true } },
            variants: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addToWishlist(userId: number, productId: number) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Product not found');
    try {
      return await this.prisma.wishlist.create({ data: { userId, productId } });
    } catch {
      throw new ConflictException('Product already in wishlist');
    }
  }

  async removeFromWishlist(userId: number, productId: number) {
    const item = await this.prisma.wishlist.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    if (!item) throw new NotFoundException('Product not in wishlist');
    return this.prisma.wishlist.delete({
      where: { userId_productId: { userId, productId } },
    });
  }
}
