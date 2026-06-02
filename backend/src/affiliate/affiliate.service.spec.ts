// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AffiliateService } from './affiliate.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock, MockPrisma } from '../test-utils/prisma.mock';
import { AttributionType } from '@prisma/client';

describe('AffiliateService', () => {
  let service: AffiliateService;
  let prisma: MockPrisma;

  const mockAffiliate = {
    id: 1,
    userId: 10,
    code: 'ABCD1234',
    commissionPct: 5,
    totalEarned: 0,
    isActive: true,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AffiliateService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<AffiliateService>(AffiliateService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(service).toBeDefined());

  // ─── createAccount ────────────────────────────────────────────────────────────

  describe('createAccount', () => {
    it('creates a new affiliate account', async () => {
      prisma.affiliateAccount.findUnique.mockResolvedValue(null);
      prisma.affiliateAccount.create.mockResolvedValue(mockAffiliate);

      const result = await service.createAccount({ userId: 10 });
      expect(result.userId).toBe(10);
      expect(result.commissionPct).toBe(5);
      expect(result.code).toBeDefined();
    });

    it('uses custom commissionPct when provided', async () => {
      prisma.affiliateAccount.findUnique.mockResolvedValue(null);
      prisma.affiliateAccount.create.mockResolvedValue({
        ...mockAffiliate,
        commissionPct: 10,
      });

      const result = await service.createAccount({
        userId: 10,
        commissionPct: 10,
      });
      expect(result.commissionPct).toBe(10);
    });

    it('throws BadRequestException if account already exists', async () => {
      prisma.affiliateAccount.findUnique.mockResolvedValue(mockAffiliate);
      await expect(service.createAccount({ userId: 10 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── getAccount ───────────────────────────────────────────────────────────────

  describe('getAccount', () => {
    it('returns account with recent attributions', async () => {
      prisma.affiliateAccount.findUnique.mockResolvedValue({
        ...mockAffiliate,
        attributions: [],
      });
      const result = await service.getAccount(10);
      expect(result.code).toBe('ABCD1234');
    });

    it('throws NotFoundException for unknown user', async () => {
      prisma.affiliateAccount.findUnique.mockResolvedValue(null);
      await expect(service.getAccount(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── trackAttribution ─────────────────────────────────────────────────────────

  describe('trackAttribution', () => {
    it('tracks attribution without affiliate code', async () => {
      prisma.campaignAttribution.create.mockResolvedValue({
        id: 1,
        affiliateId: null,
        orderId: null,
        utmSource: 'google',
        utmCampaign: 'summer-sale',
        attributionType: AttributionType.LAST_TOUCH,
        commissionAmount: 0,
      });

      const result = await service.trackAttribution({
        utmSource: 'google',
        utmCampaign: 'summer-sale',
      });
      expect(result.utmSource).toBe('google');
      expect(result.commissionAmount).toBe(0);
    });

    it('computes commission when affiliate code and orderId are provided', async () => {
      prisma.affiliateAccount.findUnique.mockResolvedValue(mockAffiliate);
      prisma.order.findUnique.mockResolvedValue({ id: 5, total: 2000 });
      prisma.affiliateAccount.update.mockResolvedValue({
        ...mockAffiliate,
        totalEarned: 100,
      });
      prisma.campaignAttribution.create.mockResolvedValue({
        id: 2,
        affiliateId: 1,
        orderId: 5,
        commissionAmount: 100, // 5% of 2000
        attributionType: AttributionType.LAST_TOUCH,
      });

      const result = await service.trackAttribution({
        affiliateCode: 'ABCD1234',
        orderId: 5,
      });
      expect(result.commissionAmount).toBe(100);
      expect(prisma.affiliateAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { totalEarned: { increment: 100 } } }),
      );
    });

    it('skips commission when affiliate code is invalid', async () => {
      prisma.affiliateAccount.findUnique.mockResolvedValue(null);
      prisma.campaignAttribution.create.mockResolvedValue({
        id: 3,
        affiliateId: null,
        commissionAmount: 0,
        attributionType: AttributionType.LAST_TOUCH,
      });

      const result = await service.trackAttribution({
        affiliateCode: 'INVALID',
        orderId: 5,
      });
      expect(result.commissionAmount).toBe(0);
      expect(result.affiliateId).toBeNull();
    });

    it('skips commission for inactive affiliate', async () => {
      prisma.affiliateAccount.findUnique.mockResolvedValue({
        ...mockAffiliate,
        isActive: false,
      });
      prisma.campaignAttribution.create.mockResolvedValue({
        id: 4,
        affiliateId: null,
        commissionAmount: 0,
        attributionType: AttributionType.LAST_TOUCH,
      });

      const result = await service.trackAttribution({
        affiliateCode: 'ABCD1234',
        orderId: 5,
      });
      expect(result.commissionAmount).toBe(0);
    });
  });

  // ─── getAttributionsByAffiliate ───────────────────────────────────────────────

  describe('getAttributionsByAffiliate', () => {
    it('returns attributions for an affiliate', async () => {
      prisma.campaignAttribution.findMany.mockResolvedValue([
        { id: 1, affiliateId: 1, commissionAmount: 100 },
        { id: 2, affiliateId: 1, commissionAmount: 200 },
      ]);
      const result = await service.getAttributionsByAffiliate(1);
      expect(result).toHaveLength(2);
    });
  });

  // ─── listAccounts ─────────────────────────────────────────────────────────────

  describe('listAccounts', () => {
    it('returns accounts sorted by totalEarned descending', async () => {
      prisma.affiliateAccount.findMany.mockResolvedValue([
        { ...mockAffiliate, totalEarned: 5000 },
        { ...mockAffiliate, id: 2, userId: 11, totalEarned: 1000 },
      ]);
      const result = await service.listAccounts();
      expect(result[0].totalEarned).toBe(5000);
      expect(prisma.affiliateAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { totalEarned: 'desc' } }),
      );
    });
  });
});
