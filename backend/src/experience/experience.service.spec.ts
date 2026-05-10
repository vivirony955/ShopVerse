// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExperienceService } from './experience.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock, MockPrisma } from '../test-utils/prisma.mock';

describe('ExperienceService', () => {
  let service: ExperienceService;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExperienceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<ExperienceService>(ExperienceService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(service).toBeDefined());

  // ─── saveForLater ─────────────────────────────────────────────────────────────

  describe('saveForLater', () => {
    it('saves a variant for later', async () => {
      prisma.savedForLater.upsert.mockResolvedValue({
        id: 1,
        userId: 1,
        variantId: 5,
        addedAt: new Date(),
        variant: { id: 5, product: { name: 'Blue T-Shirt' } },
      });

      const result = await service.saveForLater(1, { variantId: 5 });
      expect(prisma.savedForLater.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_variantId: { userId: 1, variantId: 5 } },
        }),
      );
      expect(result.variantId).toBe(5);
    });
  });

  // ─── getSavedForLater ─────────────────────────────────────────────────────────

  describe('getSavedForLater', () => {
    it('returns saved items for user', async () => {
      prisma.savedForLater.findMany.mockResolvedValue([
        { id: 1, variantId: 5 },
        { id: 2, variantId: 6 },
      ]);
      const result = await service.getSavedForLater(1);
      expect(result).toHaveLength(2);
    });
  });

  // ─── removeSavedForLater ──────────────────────────────────────────────────────

  describe('removeSavedForLater', () => {
    it('deletes saved item', async () => {
      prisma.savedForLater.deleteMany.mockResolvedValue({ count: 1 });
      await service.removeSavedForLater(1, 5);
      expect(prisma.savedForLater.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1, variantId: 5 },
      });
    });
  });

  // ─── moveToCart ───────────────────────────────────────────────────────────────

  describe('moveToCart', () => {
    it('moves item from saved list to cart and deletes from saved', async () => {
      prisma.savedForLater.findUnique.mockResolvedValue({ userId: 1, variantId: 5 });
      prisma.cart.upsert.mockResolvedValue({ id: 10, userId: 1 });
      prisma.cartItem.upsert.mockResolvedValue({ id: 20, cartId: 10, variantId: 5, quantity: 1 });
      prisma.savedForLater.delete.mockResolvedValue({ userId: 1, variantId: 5 });

      const result = await service.moveToCart(1, 5);
      expect(result).toEqual({ moved: true });
      expect(prisma.savedForLater.delete).toHaveBeenCalled();
      expect(prisma.cartItem.upsert).toHaveBeenCalled();
    });

    it('throws NotFoundException when item is not in saved list', async () => {
      prisma.savedForLater.findUnique.mockResolvedValue(null);
      await expect(service.moveToCart(1, 999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── recentlyPurchased ────────────────────────────────────────────────────────

  describe('recentlyPurchased', () => {
    it('returns deduplicated recently purchased items', async () => {
      prisma.orderItem.findMany.mockResolvedValue([
        { variant: { productId: 1, product: { name: 'T-Shirt' } } },
        { variant: { productId: 1, product: { name: 'T-Shirt' } } }, // duplicate
        { variant: { productId: 2, product: { name: 'Jeans' } } },
      ]);
      const result = await service.recentlyPurchased(1);
      expect(result).toHaveLength(2); // deduplicated
    });

    it('respects the limit parameter', async () => {
      const items = Array.from({ length: 20 }, (_, i) => ({
        variant: { productId: i + 1, product: { name: `Product ${i + 1}` } },
      }));
      prisma.orderItem.findMany.mockResolvedValue(items);
      const result = await service.recentlyPurchased(1, 5);
      expect(result).toHaveLength(5);
    });
  });

  // ─── createSlot ───────────────────────────────────────────────────────────────

  describe('createSlot', () => {
    it('creates a delivery slot', async () => {
      prisma.deliverySlot.create.mockResolvedValue({
        id: 1,
        date: new Date('2024-12-25'),
        slotLabel: '9am-12pm',
        maxOrders: 50,
        bookedCount: 0,
        isActive: true,
      });

      const result = await service.createSlot({
        date: '2024-12-25',
        slotLabel: '9am-12pm',
        maxOrders: 50,
      });
      expect(result.slotLabel).toBe('9am-12pm');
      expect(result.bookedCount).toBe(0);
    });
  });

  // ─── getAvailableSlots ────────────────────────────────────────────────────────

  describe('getAvailableSlots', () => {
    it('returns active available slots in date range', async () => {
      prisma.deliverySlot.findMany.mockResolvedValue([
        { id: 1, slotLabel: '9am-12pm', bookedCount: 10, maxOrders: 50 },
        { id: 2, slotLabel: '2pm-6pm', bookedCount: 50, maxOrders: 50 },
      ]);
      const result = await service.getAvailableSlots('2024-12-25');
      expect(result).toHaveLength(2);
    });
  });

  // ─── bookSlot ─────────────────────────────────────────────────────────────────

  describe('bookSlot', () => {
    it('increments bookedCount', async () => {
      // bookSlot uses $queryRaw for atomic conditional increment
      prisma.$queryRaw.mockResolvedValue([{ id: 1, bookedCount: 11, maxOrders: 50, isActive: true }]);

      const result = await service.bookSlot(1);
      expect(result.bookedCount).toBe(11);
    });

    it('throws NotFoundException for unknown slot', async () => {
      prisma.deliverySlot.findUnique.mockResolvedValue(null);
      await expect(service.bookSlot(999)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when slot is inactive', async () => {
      prisma.deliverySlot.findUnique.mockResolvedValue({
        id: 1,
        bookedCount: 0,
        maxOrders: 50,
        isActive: false,
      });
      await expect(service.bookSlot(1)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when slot is fully booked', async () => {
      prisma.deliverySlot.findUnique.mockResolvedValue({
        id: 1,
        bookedCount: 50,
        maxOrders: 50,
        isActive: true,
      });
      await expect(service.bookSlot(1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── addGiftOption ────────────────────────────────────────────────────────────

  describe('addGiftOption', () => {
    it('creates gift option for order', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 5, userId: 1 });
      prisma.giftOption.upsert.mockResolvedValue({
        id: 1,
        orderId: 5,
        message: 'Happy Birthday!',
        wrapping: true,
        recipientName: 'Alice',
      });

      const result = await service.addGiftOption({
        orderId: 5,
        message: 'Happy Birthday!',
        wrapping: true,
        recipientName: 'Alice',
      });
      expect(result.message).toBe('Happy Birthday!');
      expect(result.wrapping).toBe(true);
    });

    it('throws NotFoundException for unknown order', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(service.addGiftOption({ orderId: 999 })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getGiftOption ────────────────────────────────────────────────────────────

  describe('getGiftOption', () => {
    it('returns gift option for order', async () => {
      prisma.giftOption.findUnique.mockResolvedValue({
        id: 1,
        orderId: 5,
        message: 'Congrats!',
        wrapping: false,
      });
      const result = await service.getGiftOption(5);
      expect(result?.orderId).toBe(5);
    });
  });
});
