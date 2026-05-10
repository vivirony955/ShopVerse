// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock, MockPrisma } from '../test-utils/prisma.mock';

describe('CouponsService', () => {
  let service: CouponsService;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CouponsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<CouponsService>(CouponsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(service).toBeDefined());

  const baseCoupon = {
    id: 1,
    code: 'SAVE20',
    isActive: true,
    expiresAt: null,
    maxUses: null,
    usedCount: 0,
    minOrderAmount: 0,
    discountType: 'PERCENTAGE',
    discountValue: 20,
  };

  // ─── validateCoupon ───────────────────────────────────────────────────────────

  describe('validateCoupon', () => {
    it('returns valid=true with discount for a valid coupon', async () => {
      prisma.coupon.findUnique.mockResolvedValue(baseCoupon);
      const result = await service.validateCoupon('SAVE20', 1000);
      expect(result.valid).toBe(true);
      expect(result.discount).toBe(200); // 20% of 1000
    });

    it('throws NotFoundException for unknown coupon', async () => {
      prisma.coupon.findUnique.mockResolvedValue(null);
      await expect(service.validateCoupon('FAKE', 500)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException for inactive coupon', async () => {
      prisma.coupon.findUnique.mockResolvedValue({
        ...baseCoupon,
        isActive: false,
      });
      await expect(service.validateCoupon('SAVE20', 500)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException for expired coupon', async () => {
      const expired = { ...baseCoupon, expiresAt: new Date('2020-01-01') };
      prisma.coupon.findUnique.mockResolvedValue(expired);
      await expect(service.validateCoupon('SAVE20', 500)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when usage limit reached', async () => {
      prisma.coupon.findUnique.mockResolvedValue({
        ...baseCoupon,
        maxUses: 10,
        usedCount: 10,
      });
      await expect(service.validateCoupon('SAVE20', 500)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when order below minOrderAmount', async () => {
      prisma.coupon.findUnique.mockResolvedValue({
        ...baseCoupon,
        minOrderAmount: 1000,
      });
      await expect(service.validateCoupon('SAVE20', 500)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('still valid when usedCount < maxUses', async () => {
      prisma.coupon.findUnique.mockResolvedValue({
        ...baseCoupon,
        maxUses: 10,
        usedCount: 5,
      });
      const result = await service.validateCoupon('SAVE20', 500);
      expect(result.valid).toBe(true);
    });

    it('valid when not expired (future date)', async () => {
      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);
      prisma.coupon.findUnique.mockResolvedValue({
        ...baseCoupon,
        expiresAt: future,
      });
      const result = await service.validateCoupon('SAVE20', 500);
      expect(result.valid).toBe(true);
    });
  });

  // ─── calcDiscount (via validateCoupon) ───────────────────────────────────────

  describe('discount calculation', () => {
    it('calculates PERCENTAGE discount correctly', async () => {
      prisma.coupon.findUnique.mockResolvedValue({
        ...baseCoupon,
        discountType: 'PERCENTAGE',
        discountValue: 10,
      });
      const result = await service.validateCoupon('SAVE10', 2000);
      expect(result.discount).toBe(200); // 10% of 2000
    });

    it('caps PERCENTAGE discount at order amount', async () => {
      prisma.coupon.findUnique.mockResolvedValue({
        ...baseCoupon,
        discountType: 'PERCENTAGE',
        discountValue: 150,
      });
      const result = await service.validateCoupon('HUGE', 100);
      expect(result.discount).toBe(100); // capped at order amount
    });

    it('calculates FIXED discount correctly', async () => {
      prisma.coupon.findUnique.mockResolvedValue({
        ...baseCoupon,
        discountType: 'FIXED',
        discountValue: 100,
      });
      const result = await service.validateCoupon('FLAT100', 500);
      expect(result.discount).toBe(100);
    });

    it('caps FIXED discount at order amount', async () => {
      prisma.coupon.findUnique.mockResolvedValue({
        ...baseCoupon,
        discountType: 'FIXED',
        discountValue: 999,
      });
      const result = await service.validateCoupon('FLAT999', 200);
      expect(result.discount).toBe(200); // capped at order amount
    });
  });

  // ─── applyDiscount ────────────────────────────────────────────────────────────

  describe('applyDiscount', () => {
    it('returns numeric discount amount', async () => {
      prisma.coupon.findUnique.mockResolvedValue({
        ...baseCoupon,
        discountType: 'FIXED',
        discountValue: 50,
      });
      const discount = await service.applyDiscount('SAVE20', 300);
      expect(discount).toBe(50);
    });
  });

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all coupons', async () => {
      prisma.coupon.findMany.mockResolvedValue([baseCoupon]);
      expect(await service.findAll()).toEqual([baseCoupon]);
    });
  });

  describe('create', () => {
    it('creates a coupon', async () => {
      prisma.coupon.create.mockResolvedValue({ id: 2, code: 'NEW10' });
      const result = await service.create({
        code: 'NEW10',
        discountType: 'PERCENTAGE',
        discountValue: 10,
      });
      expect(result).toHaveProperty('code', 'NEW10');
    });

    it('converts expiresAt string to Date', async () => {
      prisma.coupon.create.mockResolvedValue({ id: 3 });
      await service.create({
        code: 'EXP',
        discountType: 'FIXED',
        discountValue: 50,
        expiresAt: '2030-12-31',
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const dataArg = prisma.coupon.create.mock.calls[0][0].data;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(dataArg.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe('update', () => {
    it('updates and returns coupon', async () => {
      prisma.coupon.findUnique.mockResolvedValue(baseCoupon);
      prisma.coupon.update.mockResolvedValue({
        ...baseCoupon,
        isActive: false,
      });
      const result = await service.update(1, { isActive: false });
      expect(result.isActive).toBe(false);
    });

    it('throws NotFoundException for unknown coupon', async () => {
      prisma.coupon.findUnique.mockResolvedValue(null);
      await expect(service.update(999, {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes and returns coupon', async () => {
      prisma.coupon.findUnique.mockResolvedValue(baseCoupon);
      prisma.coupon.delete.mockResolvedValue({ id: 1 });
      expect(await service.remove(1)).toEqual({ id: 1 });
    });

    it('throws NotFoundException for unknown coupon', async () => {
      prisma.coupon.findUnique.mockResolvedValue(null);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });
});
