// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock, MockPrisma } from '../test-utils/prisma.mock';

describe('WishlistService', () => {
  let service: WishlistService;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WishlistService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<WishlistService>(WishlistService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(service).toBeDefined());

  // ─── getWishlist ─────────────────────────────────────────────────────────────

  describe('getWishlist', () => {
    it('returns wishlist items for a user', async () => {
      const items = [
        { id: 1, userId: 1, productId: 10, product: { id: 10, name: 'Polo' } },
      ];
      prisma.wishlist.findMany.mockResolvedValue(items);
      const result = await service.getWishlist(1);
      expect(result).toEqual(items);
      expect(prisma.wishlist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 1 } }),
      );
    });

    it('returns empty array when wishlist is empty', async () => {
      prisma.wishlist.findMany.mockResolvedValue([]);
      expect(await service.getWishlist(1)).toEqual([]);
    });
  });

  // ─── addToWishlist ────────────────────────────────────────────────────────────

  describe('addToWishlist', () => {
    it('adds a product to wishlist', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 10, name: 'Polo' });
      prisma.wishlist.create.mockResolvedValue({
        id: 1,
        userId: 1,
        productId: 10,
      });
      const result = await service.addToWishlist(1, 10);
      expect(result).toHaveProperty('id', 1);
      expect(prisma.wishlist.create).toHaveBeenCalledWith({
        data: { userId: 1, productId: 10 },
      });
    });

    it('throws NotFoundException for unknown product', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.addToWishlist(1, 999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when product already in wishlist', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 10, name: 'Polo' });
      prisma.wishlist.create.mockRejectedValue(
        new Error('Unique constraint violation'),
      );
      await expect(service.addToWishlist(1, 10)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── removeFromWishlist ───────────────────────────────────────────────────────

  describe('removeFromWishlist', () => {
    it('removes product from wishlist', async () => {
      prisma.wishlist.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        productId: 10,
      });
      prisma.wishlist.delete.mockResolvedValue({ id: 1 });
      const result = await service.removeFromWishlist(1, 10);
      expect(result).toEqual({ id: 1 });
      expect(prisma.wishlist.delete).toHaveBeenCalledWith({
        where: { userId_productId: { userId: 1, productId: 10 } },
      });
    });

    it('throws NotFoundException when product not in wishlist', async () => {
      prisma.wishlist.findUnique.mockResolvedValue(null);
      await expect(service.removeFromWishlist(1, 99)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
