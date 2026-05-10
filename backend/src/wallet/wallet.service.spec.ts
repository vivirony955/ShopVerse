// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock, MockPrisma } from '../test-utils/prisma.mock';
import { LedgerType, Prisma, ReconcileStatus, WalletTxType } from '@prisma/client';

describe('WalletService', () => {
  let service: WalletService;
  let prisma: MockPrisma;

  const mockWallet = { id: 1, userId: 1, balance: 500, updatedAt: new Date() };

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<WalletService>(WalletService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(service).toBeDefined());

  // ─── getWallet ────────────────────────────────────────────────────────────────

  describe('getWallet', () => {
    it('upserts and returns wallet with transactions', async () => {
      prisma.wallet.upsert.mockResolvedValue({ ...mockWallet, transactions: [] });
      const result = await service.getWallet(1);
      expect(prisma.wallet.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 1 } }),
      );
      expect(result.balance).toBe(500);
    });
  });

  // ─── credit ───────────────────────────────────────────────────────────────────

  describe('credit', () => {
    it('credits wallet and creates ledger entry', async () => {
      prisma.walletTransaction.findFirst.mockResolvedValue(null); // no existing idempotency hit
      prisma.$transaction.mockImplementation((cb: any) =>
        cb({
          wallet: {
            upsert: jest.fn().mockResolvedValue({ ...mockWallet, balance: 600 }),
          },
          walletTransaction: {
            create: jest.fn().mockResolvedValue({
              id: 10,
              walletId: 1,
              amount: 100,
              type: WalletTxType.CREDIT,
              balanceAfter: 600,
            }),
          },
          ledgerEntry: { create: jest.fn().mockResolvedValue({}) },
        }),
      );

      const result = await service.credit({ userId: 1, amount: 100 });
      expect(result.amount).toBe(100);
      expect(result.type).toBe(WalletTxType.CREDIT);
    });

    it('returns existing transaction for duplicate reference (idempotency)', async () => {
      const existing = { id: 5, amount: 100, type: WalletTxType.CREDIT };
      // Simulate P2002 unique constraint violation on duplicate reference
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '0.0.0', meta: {} });
      prisma.$transaction.mockRejectedValue(p2002);
      prisma.walletTransaction.findFirst.mockResolvedValue(existing);

      const result = await service.credit({ userId: 1, amount: 100, reference: 'ref-001' });
      expect(result).toEqual(existing);
    });
  });

  // ─── debit ────────────────────────────────────────────────────────────────────

  describe('debit', () => {
    it('debits wallet when balance is sufficient', async () => {
      const updatedWallet = { ...mockWallet, balance: 400 };
      const txMock = {
        wallet: {
          findUnique: jest.fn()
            .mockResolvedValueOnce(mockWallet)      // initial lookup
            .mockResolvedValueOnce(updatedWallet),  // refresh after updateMany
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        walletTransaction: {
          create: jest.fn().mockResolvedValue({ id: 11, amount: 100, type: WalletTxType.DEBIT, balanceAfter: 400 }),
        },
        ledgerEntry: { create: jest.fn() },
      };
      prisma.$transaction.mockImplementation((cb: any) => cb(txMock));

      const result = await service.debit({ userId: 1, amount: 100 });
      expect(result.type).toBe(WalletTxType.DEBIT);
      expect(result.balanceAfter).toBe(400);
    });

    it('throws BadRequestException when balance is insufficient', async () => {
      const txMock = {
        wallet: {
          findUnique: jest.fn().mockResolvedValue({ ...mockWallet, balance: 50 }),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };
      prisma.$transaction.mockImplementation((cb: any) => cb(txMock));

      await expect(service.debit({ userId: 1, amount: 200 })).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when wallet does not exist', async () => {
      const txMock = {
        wallet: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      prisma.$transaction.mockImplementation((cb: any) => cb(txMock));

      await expect(service.debit({ userId: 1, amount: 50 })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── refundToWallet ───────────────────────────────────────────────────────────

  describe('refundToWallet', () => {
    it('credits wallet with order-scoped reference', async () => {
      prisma.walletTransaction.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockImplementation((cb: any) =>
        cb({
          wallet: { upsert: jest.fn().mockResolvedValue(mockWallet) },
          walletTransaction: { create: jest.fn().mockResolvedValue({ id: 12, amount: 250, type: WalletTxType.CREDIT, balanceAfter: 750 }) },
          ledgerEntry: { create: jest.fn() },
        }),
      );

      const result = await service.refundToWallet(1, 250, 42);
      expect(result.amount).toBe(250);
    });

    it('is idempotent for the same order refund', async () => {
      const existing = { id: 5, amount: 250, type: WalletTxType.CREDIT };
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '0.0.0', meta: {} });
      prisma.$transaction.mockRejectedValue(p2002);
      prisma.walletTransaction.findFirst.mockResolvedValue(existing);

      const result = await service.refundToWallet(1, 250, 42);
      expect(result).toEqual(existing);
    });
  });

  // ─── recordGatewayPayment ─────────────────────────────────────────────────────

  describe('recordGatewayPayment', () => {
    it('marks as MATCHED when amounts match', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 5, total: 1000 });
      prisma.paymentReconciliation.upsert.mockResolvedValue({
        gatewayRef: 'pay_123',
        status: ReconcileStatus.MATCHED,
        discrepancy: 0,
      });

      const result = await service.recordGatewayPayment({
        gatewayRef: 'pay_123',
        gatewayAmount: 1000,
        orderId: 5,
      });
      expect(result.status).toBe(ReconcileStatus.MATCHED);
    });

    it('marks as DISCREPANCY when amounts differ', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 5, total: 1000 });
      prisma.paymentReconciliation.upsert.mockResolvedValue({
        gatewayRef: 'pay_124',
        status: ReconcileStatus.DISCREPANCY,
        discrepancy: 50,
      });

      const result = await service.recordGatewayPayment({
        gatewayRef: 'pay_124',
        gatewayAmount: 950,
        orderId: 5,
      });
      expect(result.status).toBe(ReconcileStatus.DISCREPANCY);
    });

    it('creates PENDING record when no orderId is provided', async () => {
      prisma.paymentReconciliation.upsert.mockResolvedValue({
        gatewayRef: 'pay_125',
        status: ReconcileStatus.PENDING,
      });

      const result = await service.recordGatewayPayment({
        gatewayRef: 'pay_125',
        gatewayAmount: 500,
      });
      expect(result.status).toBe(ReconcileStatus.PENDING);
    });
  });

  // ─── getReconciliationReport ──────────────────────────────────────────────────

  describe('getReconciliationReport', () => {
    it('returns reconciliation records in date range', async () => {
      prisma.paymentReconciliation.findMany.mockResolvedValue([
        { gatewayRef: 'pay_1', status: ReconcileStatus.MATCHED },
        { gatewayRef: 'pay_2', status: ReconcileStatus.DISCREPANCY },
      ]);
      const from = new Date('2024-01-01');
      const to = new Date('2024-01-31');
      const result = await service.getReconciliationReport(from, to);
      expect(result).toHaveLength(2);
    });
  });

  // ─── getTransactionHistory ────────────────────────────────────────────────────

  describe('getTransactionHistory', () => {
    it('returns transactions for user wallet', async () => {
      prisma.wallet.findUnique.mockResolvedValue(mockWallet);
      prisma.walletTransaction.findMany.mockResolvedValue([
        { id: 1, amount: 100, type: WalletTxType.CREDIT },
        { id: 2, amount: 50, type: WalletTxType.DEBIT },
      ]);
      const result = await service.getTransactionHistory(1);
      expect(result).toHaveLength(2);
    });

    it('throws NotFoundException when wallet does not exist', async () => {
      prisma.wallet.findUnique.mockResolvedValue(null);
      await expect(service.getTransactionHistory(999)).rejects.toThrow(NotFoundException);
    });
  });
});
