// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LegalService } from './legal.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock, MockPrisma } from '../test-utils/prisma.mock';
import { PolicyType } from '@prisma/client';

describe('LegalService', () => {
  let service: LegalService;
  let prisma: MockPrisma;

  const mockPolicy = {
    id: 1,
    type: PolicyType.TERMS_AND_CONDITIONS,
    version: '2.0',
    content: 'These are the terms...',
    isActive: true,
    publishedAt: new Date(),
    createdAt: new Date(),
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [LegalService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<LegalService>(LegalService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(service).toBeDefined());

  // ─── createPolicy ─────────────────────────────────────────────────────────────

  describe('createPolicy', () => {
    it('deactivates previous version and creates new active policy', async () => {
      prisma.policyDocument.updateMany.mockResolvedValue({ count: 1 });
      prisma.policyDocument.create.mockResolvedValue(mockPolicy);

      const result = await service.createPolicy({
        type: PolicyType.TERMS_AND_CONDITIONS,
        version: '2.0',
        content: 'These are the terms...',
      });

      expect(prisma.policyDocument.updateMany).toHaveBeenCalledWith({
        where: { type: PolicyType.TERMS_AND_CONDITIONS, isActive: true },
        data: { isActive: false },
      });
      expect(result.isActive).toBe(true);
      expect(result.version).toBe('2.0');
    });
  });

  // ─── getActivePolicy ─────────────────────────────────────────────────────────

  describe('getActivePolicy', () => {
    it('returns the active policy for a type', async () => {
      prisma.policyDocument.findFirst.mockResolvedValue(mockPolicy);
      const result = await service.getActivePolicy(
        PolicyType.TERMS_AND_CONDITIONS,
      );
      expect(result.version).toBe('2.0');
      expect(result.isActive).toBe(true);
    });

    it('throws NotFoundException when no active policy exists', async () => {
      prisma.policyDocument.findFirst.mockResolvedValue(null);
      await expect(
        service.getActivePolicy(PolicyType.PRIVACY_POLICY),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getAllPolicies ───────────────────────────────────────────────────────────

  describe('getAllPolicies', () => {
    it('returns active policy summary for each type', async () => {
      prisma.policyDocument.findFirst.mockImplementation(
        ({ where }: { where: { type?: string } }) => {
          if (where.type === PolicyType.TERMS_AND_CONDITIONS) {
            return Promise.resolve({
              id: 1,
              type: PolicyType.TERMS_AND_CONDITIONS,
              version: '2.0',
              publishedAt: new Date(),
            });
          }
          return Promise.resolve(null);
        },
      );

      const result = await service.getAllPolicies();
      // Only non-null results
      expect(result.length).toBeGreaterThan(0);
      const tos = result.find(
        (p) => p?.type === PolicyType.TERMS_AND_CONDITIONS,
      );
      expect(tos).toBeDefined();
    });
  });

  // ─── getPolicyHistory ─────────────────────────────────────────────────────────

  describe('getPolicyHistory', () => {
    it('returns all versions of a policy type', async () => {
      prisma.policyDocument.findMany.mockResolvedValue([
        { ...mockPolicy, version: '2.0' },
        { ...mockPolicy, id: 2, version: '1.0', isActive: false },
      ]);
      const result = await service.getPolicyHistory(
        PolicyType.TERMS_AND_CONDITIONS,
      );
      expect(result).toHaveLength(2);
      expect(result[0].version).toBe('2.0');
    });
  });

  // ─── recordCookieConsent ─────────────────────────────────────────────────────

  describe('recordCookieConsent', () => {
    it('records consent for authenticated user', async () => {
      prisma.cookieConsent.create.mockResolvedValue({
        id: 1,
        userId: 1,
        analytics: true,
        marketing: false,
        ip: '127.0.0.1',
        consentedAt: new Date(),
      });

      const result = await service.recordCookieConsent(1, '127.0.0.1', {
        analytics: true,
        marketing: false,
      });
      expect(result.analytics).toBe(true);
      expect(result.marketing).toBe(false);
    });

    it('records consent for anonymous user with sessionId', async () => {
      prisma.cookieConsent.create.mockResolvedValue({
        id: 2,
        userId: null,
        sessionId: 'sess-abc',
        analytics: false,
        marketing: true,
        ip: '192.168.1.1',
      });

      const result = await service.recordCookieConsent(
        undefined,
        '192.168.1.1',
        {
          analytics: false,
          marketing: true,
          sessionId: 'sess-abc',
        },
      );
      expect(result.userId).toBeNull();
      expect(result.sessionId).toBe('sess-abc');
    });
  });

  // ─── getLatestConsent ─────────────────────────────────────────────────────────

  describe('getLatestConsent', () => {
    it('returns the most recent consent record for user', async () => {
      const recentConsent = {
        id: 5,
        userId: 1,
        analytics: true,
        marketing: true,
        consentedAt: new Date(),
      };
      prisma.cookieConsent.findFirst.mockResolvedValue(recentConsent);

      const result = await service.getLatestConsent(1);
      expect(result?.analytics).toBe(true);
      expect(prisma.cookieConsent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 1 },
          orderBy: { consentedAt: 'desc' },
        }),
      );
    });
  });
});
