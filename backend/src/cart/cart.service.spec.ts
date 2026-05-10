// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CartService } from './cart.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock, MockPrisma } from '../test-utils/prisma.mock';

describe('CartService', () => {
  let service: CartService;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(service).toBeDefined());

  // ─── getCart ─────────────────────────────────────────────────────────────────

  describe('getCart', () => {
    it('returns existing cart with items', async () => {
      const cart = { id: 1, userId: 1, items: [] };
      prisma.cart.findUnique.mockResolvedValue(cart);
      expect(await service.getCart(1)).toEqual(cart);
      expect(prisma.cart.create).not.toHaveBeenCalled();
    });

    it('creates and returns a new cart when none exists', async () => {
      const newCart = { id: 2, userId: 1, items: [] };
      prisma.cart.findUnique.mockResolvedValue(null);
      prisma.cart.create.mockResolvedValue(newCart);
      const result = await service.getCart(1);
      expect(result).toEqual(newCart);
      expect(prisma.cart.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { userId: 1 } }),
      );
    });
  });

  // ─── addItem ─────────────────────────────────────────────────────────────────

  describe('addItem', () => {
    const variant = { id: 5, stock: 10 };
    const cart = { id: 1, userId: 1 };

    it('creates a new cart item when item not in cart', async () => {
      prisma.variant.findUnique.mockResolvedValue(variant);
      prisma.cart.findUnique.mockResolvedValue(cart);
      prisma.cartItem.findUnique.mockResolvedValue(null);
      prisma.cartItem.create.mockResolvedValue({ id: 10, cartId: 1, variantId: 5, quantity: 2 });
      const result = await service.addItem(1, 5, 2);
      expect(result).toHaveProperty('id', 10);
      expect(prisma.cartItem.create).toHaveBeenCalledWith({
        data: { cartId: 1, variantId: 5, quantity: 2 },
      });
    });

    it('increments quantity when item already in cart', async () => {
      prisma.variant.findUnique.mockResolvedValue(variant);
      prisma.cart.findUnique.mockResolvedValue(cart);
      prisma.cartItem.findUnique.mockResolvedValue({ id: 10, cartId: 1, variantId: 5, quantity: 3 });
      prisma.cartItem.update.mockResolvedValue({ id: 10, quantity: 5 });
      const result = await service.addItem(1, 5, 2);
      expect(result.quantity).toBe(5);
      expect(prisma.cartItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { quantity: 5 } }),
      );
    });

    it('creates cart if user has no cart', async () => {
      prisma.variant.findUnique.mockResolvedValue(variant);
      prisma.cart.findUnique.mockResolvedValue(null);
      prisma.cart.create.mockResolvedValue(cart);
      prisma.cartItem.findUnique.mockResolvedValue(null);
      prisma.cartItem.create.mockResolvedValue({ id: 1, cartId: 1, variantId: 5, quantity: 1 });
      await service.addItem(1, 5, 1);
      expect(prisma.cart.create).toHaveBeenCalled();
    });

    it('throws NotFoundException for unknown variant', async () => {
      prisma.variant.findUnique.mockResolvedValue(null);
      await expect(service.addItem(1, 999, 1)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when stock insufficient (new item)', async () => {
      prisma.variant.findUnique.mockResolvedValue({ id: 5, stock: 1, reservedStock: 0 });
      prisma.cart.findUnique.mockResolvedValue(cart);
      prisma.cartItem.findUnique.mockResolvedValue(null);
      await expect(service.addItem(1, 5, 5)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when updated quantity exceeds stock', async () => {
      prisma.variant.findUnique.mockResolvedValue({ id: 5, stock: 3, reservedStock: 0 });
      prisma.cart.findUnique.mockResolvedValue(cart);
      prisma.cartItem.findUnique.mockResolvedValue({ id: 10, cartId: 1, variantId: 5, quantity: 2 });
      // existing 2 + new 2 = 4 > stock 3
      await expect(service.addItem(1, 5, 2)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── updateItem ──────────────────────────────────────────────────────────────

  describe('updateItem', () => {
    it('updates quantity of cart item', async () => {
      prisma.cart.findUnique.mockResolvedValue({ id: 1, userId: 1 });
      prisma.cartItem.findFirst.mockResolvedValue({ id: 5, cartId: 1, variantId: 2 });
      prisma.variant.findUnique.mockResolvedValue({ id: 2, stock: 20 });
      prisma.cartItem.update.mockResolvedValue({ id: 5, quantity: 4 });
      const result = await service.updateItem(1, 5, 4) as { id: number; quantity: number };
      expect(result.quantity).toBe(4);
    });

    it('throws NotFoundException when cart not found', async () => {
      prisma.cart.findUnique.mockResolvedValue(null);
      await expect(service.updateItem(1, 5, 2)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when item not in cart', async () => {
      prisma.cart.findUnique.mockResolvedValue({ id: 1 });
      prisma.cartItem.findFirst.mockResolvedValue(null);
      await expect(service.updateItem(1, 999, 2)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when requested quantity exceeds stock', async () => {
      prisma.cart.findUnique.mockResolvedValue({ id: 1 });
      prisma.cartItem.findFirst.mockResolvedValue({ id: 5, cartId: 1, variantId: 2 });
      prisma.variant.findUnique.mockResolvedValue({ id: 2, stock: 3, reservedStock: 0 });
      await expect(service.updateItem(1, 5, 10)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── removeItem ──────────────────────────────────────────────────────────────

  describe('removeItem', () => {
    it('removes an item from cart', async () => {
      prisma.cart.findUnique.mockResolvedValue({ id: 1 });
      prisma.cartItem.findFirst.mockResolvedValue({ id: 5, cartId: 1 });
      prisma.cartItem.delete.mockResolvedValue({ id: 5 });
      const result = await service.removeItem(1, 5);
      expect(result).toEqual({ id: 5 });
      expect(prisma.cartItem.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    });

    it('throws NotFoundException when cart not found', async () => {
      prisma.cart.findUnique.mockResolvedValue(null);
      await expect(service.removeItem(1, 5)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when item not in cart', async () => {
      prisma.cart.findUnique.mockResolvedValue({ id: 1 });
      prisma.cartItem.findFirst.mockResolvedValue(null);
      await expect(service.removeItem(1, 99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── clearCart ───────────────────────────────────────────────────────────────

  describe('clearCart', () => {
    it('deletes all items and returns message', async () => {
      prisma.cart.findUnique.mockResolvedValue({ id: 1 });
      prisma.cartItem.deleteMany.mockResolvedValue({ count: 3 });
      const result = await service.clearCart(1);
      expect(result).toEqual({ message: 'Cart cleared' });
      expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: 1 } });
    });

    it('returns already-empty message when no cart exists', async () => {
      prisma.cart.findUnique.mockResolvedValue(null);
      const result = await service.clearCart(1);
      expect(result).toEqual({ message: 'Cart is already empty' });
      expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
    });
  });
});
