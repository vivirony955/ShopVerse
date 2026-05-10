// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  private cartInclude = {
    items: {
      include: {
        variant: {
          include: {
            product: {
              select: {
                id: true, name: true, images: true,
                basePrice: true, discountPct: true, slug: true,
              },
            },
          },
        },
      },
    },
  };

  async getCart(userId: number) {
    let cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: this.cartInclude,
    });
    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { userId },
        include: this.cartInclude,
      });
    }
    return cart;
  }

  async addItem(userId: number, variantId: number, quantity: number) {
    const variant = await this.prisma.variant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('Variant not found');

    let cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (!cart) cart = await this.prisma.cart.create({ data: { userId } });

    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
    });

    // FINAL §9.4 R-001: advisory check uses sellable = stock − reservedStock. The
    // authoritative guard runs at reserve-time inside the order transaction.
    const sellable = variant.stock - variant.reservedStock;
    const finalQty = (existing?.quantity ?? 0) + quantity;

    // §4.1 per-variant caps (authoritative source of truth for max/min).
    if (finalQty < variant.minOrderQty) {
      throw new BadRequestException(`Minimum order quantity for this variant is ${variant.minOrderQty}`);
    }
    if (finalQty > variant.maxOrderQty) {
      throw new BadRequestException(`Maximum order quantity for this variant is ${variant.maxOrderQty}`);
    }
    if (sellable < finalQty) throw new BadRequestException('Insufficient stock');

    if (existing) {
      return this.prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: finalQty } });
    }
    return this.prisma.cartItem.create({ data: { cartId: cart.id, variantId, quantity } });
  }

  async updateItem(userId: number, itemId: number, quantity: number) {
    // FINAL §9.4 H-002: qty=0 removes the line (matches PATCH/DELETE intent users expect).
    // Negative quantities are rejected.
    if (quantity < 0) throw new BadRequestException('Quantity cannot be negative');

    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (!cart) throw new NotFoundException('Cart not found');

    const item = await this.prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
    if (!item) throw new NotFoundException('Cart item not found');

    if (quantity === 0) {
      await this.prisma.cartItem.delete({ where: { id: itemId } });
      return { message: 'Cart item removed' };
    }

    const variant = await this.prisma.variant.findUnique({ where: { id: item.variantId } });
    if (!variant) throw new BadRequestException('Insufficient stock');
    if (quantity < variant.minOrderQty) {
      throw new BadRequestException(`Minimum order quantity for this variant is ${variant.minOrderQty}`);
    }
    if (quantity > variant.maxOrderQty) {
      throw new BadRequestException(`Maximum order quantity for this variant is ${variant.maxOrderQty}`);
    }
    const sellable = variant.stock - variant.reservedStock;
    if (sellable < quantity) throw new BadRequestException('Insufficient stock');

    return this.prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
  }

  async removeItem(userId: number, itemId: number) {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (!cart) throw new NotFoundException('Cart not found');

    const item = await this.prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
    if (!item) throw new NotFoundException('Cart item not found');

    return this.prisma.cartItem.delete({ where: { id: itemId } });
  }

  async clearCart(userId: number) {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (!cart) return { message: 'Cart is already empty' };
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return { message: 'Cart cleared' };
  }
}
