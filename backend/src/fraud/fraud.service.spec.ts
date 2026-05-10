import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FraudService } from './fraud.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock, MockPrisma } from '../test-utils/prisma.mock';
import { BlacklistType, FraudFlagStatus, FraudFlagType } from '@prisma/client';

describe('FraudService', () => {
  let service: FraudService;
  let prisma: MockPrisma;

  const mockUser = { id: 1, email: 'user@test.com' };

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FraudService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<FraudService>(FraudService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(service).toBeDefined());

  // ─── computeRiskScore ─────────────────────────────────────────────────────────

  describe('computeRiskScore', () => {
    it('throws NotFoundException for unknown user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.computeRiskScore(999)).rejects.toThrow(NotFoundException);
    });

    it('returns 0 for user with no orders', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.order.findMany.mockResolvedValue([]);
      prisma.userRiskScore.upsert.mockResolvedValue({ userId: 1, score: 0 });

      const score = await service.computeRiskScore(1);
      expect(score).toBe(0);
    });

    it('returns high score for user with high return rate', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      // 3/4 = 75% return rate → strictly > 50% threshold → score += 40
      prisma.order.findMany.mockResolvedValue([
        { id: 1, status: 'RETURNED', paymentMethod: 'STRIPE' },
        { id: 2, status: 'RETURNED', paymentMethod: 'STRIPE' },
        { id: 3, status: 'RETURNED', paymentMethod: 'STRIPE' },
        { id: 4, status: 'DELIVERED', paymentMethod: 'STRIPE' },
      ]);
      prisma.userRiskScore.upsert.mockImplementation(({ create }: any) =>
        Promise.resolve({ userId: 1, score: create.score, returnRate: create.returnRate }),
      );
      prisma.fraudFlag.findFirst.mockResolvedValue(null);
      prisma.fraudFlag.upsert.mockResolvedValue({});
      prisma.fraudFlag.create.mockResolvedValue({});

      const score = await service.computeRiskScore(1);
      // 3/4 = 75% return rate → score += 40
      expect(score).toBeGreaterThanOrEqual(40);
    });

    it('flags COD abuse when COD cancel rate exceeds threshold', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.order.findMany.mockResolvedValue([
        { id: 1, status: 'CANCELLED', paymentMethod: 'COD' },
        { id: 2, status: 'CANCELLED', paymentMethod: 'COD' },
        { id: 3, status: 'CANCELLED', paymentMethod: 'COD' },
        { id: 4, status: 'CANCELLED', paymentMethod: 'COD' },
        { id: 5, status: 'DELIVERED', paymentMethod: 'COD' },
      ]);
      prisma.userRiskScore.upsert.mockImplementation(({ create }: any) =>
        Promise.resolve({ userId: 1, score: create.score, codAbuse: create.codAbuse }),
      );
      prisma.fraudFlag.findFirst.mockResolvedValue(null);
      prisma.fraudFlag.create.mockResolvedValue({});

      const score = await service.computeRiskScore(1);
      // 4/5 = 80% COD cancel rate → score += 30
      expect(score).toBeGreaterThanOrEqual(30);
    });

    it('auto-flags high-risk users when score >= 70', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      // 4/7 ≈ 57% return rate → score +40
      // 2/3 ≈ 67% COD cancel rate → score +30  → total 70 → autoFlag triggered
      prisma.order.findMany.mockResolvedValue([
        { id: 1, status: 'RETURNED', paymentMethod: 'STRIPE' },
        { id: 2, status: 'RETURNED', paymentMethod: 'STRIPE' },
        { id: 3, status: 'RETURNED', paymentMethod: 'STRIPE' },
        { id: 4, status: 'RETURNED', paymentMethod: 'STRIPE' },
        { id: 5, status: 'CANCELLED', paymentMethod: 'COD' },
        { id: 6, status: 'CANCELLED', paymentMethod: 'COD' },
        { id: 7, status: 'DELIVERED', paymentMethod: 'COD' },
      ]);
      prisma.userRiskScore.upsert.mockResolvedValue({ userId: 1, score: 70 });
      prisma.fraudFlag.findFirst.mockResolvedValue(null);
      prisma.fraudFlag.upsert.mockResolvedValue({ id: 1, type: FraudFlagType.HIGH_RETURN_RATE });
      prisma.fraudFlag.create.mockResolvedValue({ id: 2, type: FraudFlagType.COD_ABUSE });

      const score = await service.computeRiskScore(1);
      expect(score).toBeGreaterThanOrEqual(70);
      const anyFlagCall =
        (prisma.fraudFlag.upsert as jest.Mock).mock.calls.length > 0 ||
        (prisma.fraudFlag.create as jest.Mock).mock.calls.length > 0;
      expect(anyFlagCall).toBe(true);
    });
  });

  // ─── addToBlacklist ───────────────────────────────────────────────────────────

  describe('addToBlacklist', () => {
    it('upserts blacklist entry', async () => {
      prisma.blacklist.upsert.mockResolvedValue({
        id: 1,
        type: BlacklistType.EMAIL,
        value: 'fraud@bad.com',
        isActive: true,
      });

      const result = await service.addToBlacklist({
        type: BlacklistType.EMAIL,
        value: 'fraud@bad.com',
        reason: 'Repeated refund abuse',
      });
      expect(prisma.blacklist.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { type_value: { type: BlacklistType.EMAIL, value: 'fraud@bad.com' } },
        }),
      );
      expect(result.isActive).toBe(true);
    });
  });

  // ─── removeFromBlacklist ──────────────────────────────────────────────────────

  describe('removeFromBlacklist', () => {
    it('deactivates blacklist entry', async () => {
      prisma.blacklist.updateMany.mockResolvedValue({ count: 1 });
      await service.removeFromBlacklist(BlacklistType.IP, '192.168.1.1');
      expect(prisma.blacklist.updateMany).toHaveBeenCalledWith({
        where: { type: BlacklistType.IP, value: '192.168.1.1' },
        data: { isActive: false },
      });
    });
  });

  // ─── isBlacklisted ────────────────────────────────────────────────────────────

  describe('isBlacklisted', () => {
    it('returns true when active blacklist entry exists', async () => {
      prisma.blacklist.findFirst.mockResolvedValue({ id: 1, isActive: true });
      const result = await service.isBlacklisted(BlacklistType.USER, '42');
      expect(result).toBe(true);
    });

    it('returns false when no active entry exists', async () => {
      prisma.blacklist.findFirst.mockResolvedValue(null);
      const result = await service.isBlacklisted(BlacklistType.USER, '42');
      expect(result).toBe(false);
    });
  });

  // ─── flagFraud ────────────────────────────────────────────────────────────────

  describe('flagFraud', () => {
    it('creates a fraud flag', async () => {
      prisma.fraudFlag.create.mockResolvedValue({
        id: 1,
        userId: 1,
        type: FraudFlagType.SUSPICIOUS_IP,
        status: FraudFlagStatus.OPEN,
      });

      const result = await service.flagFraud({
        userId: 1,
        type: FraudFlagType.SUSPICIOUS_IP,
        detail: 'Multiple accounts from same IP',
      });
      expect(result.status).toBe(FraudFlagStatus.OPEN);
    });
  });

  // ─── resolveFlag ──────────────────────────────────────────────────────────────

  describe('resolveFlag', () => {
    it('updates flag status and records reviewer', async () => {
      prisma.fraudFlag.update.mockResolvedValue({
        id: 1,
        status: FraudFlagStatus.FALSE_POSITIVE,
        reviewedBy: 5,
        resolvedAt: new Date(),
      });

      const result = await service.resolveFlag(1, {
        status: FraudFlagStatus.FALSE_POSITIVE,
        reviewedBy: 5,
      });
      expect(result.status).toBe(FraudFlagStatus.FALSE_POSITIVE);
      expect(result.reviewedBy).toBe(5);
    });
  });

  // ─── getOpenFlags ─────────────────────────────────────────────────────────────

  describe('getOpenFlags', () => {
    it('returns only open flags', async () => {
      prisma.fraudFlag.findMany.mockResolvedValue([
        { id: 1, status: FraudFlagStatus.OPEN },
        { id: 2, status: FraudFlagStatus.OPEN },
      ]);
      const result = await service.getOpenFlags();
      expect(result).toHaveLength(2);
      expect(prisma.fraudFlag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: FraudFlagStatus.OPEN } }),
      );
    });
  });

  // ─── getBlacklist ─────────────────────────────────────────────────────────────

  describe('getBlacklist', () => {
    it('returns active blacklist entries', async () => {
      prisma.blacklist.findMany.mockResolvedValue([
        { id: 1, type: BlacklistType.EMAIL, value: 'fraud@bad.com', isActive: true },
      ]);
      const result = await service.getBlacklist();
      expect(result).toHaveLength(1);
    });

    it('filters by type when provided', async () => {
      prisma.blacklist.findMany.mockResolvedValue([]);
      await service.getBlacklist(BlacklistType.IP);
      expect(prisma.blacklist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ type: BlacklistType.IP }) }),
      );
    });
  });
});
