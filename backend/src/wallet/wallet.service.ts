// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LedgerType, Prisma, ReconcileStatus, WalletTxType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreditWalletDto, DebitWalletDto, ReconcilePaymentDto } from './dto/wallet.dto';

// V-09 FIX: maximum allowed wallet balance (₹1,00,000). Prevents unlimited accumulation
// via repeated refund-to-wallet cycles. Admin credits are also subject to this cap.
const MAX_WALLET_BALANCE = 100_000;

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  /** Get or create wallet for a user */
  async getWallet(userId: number) {
    return this.prisma.wallet.upsert({
      where: { userId },
      create: { userId, balance: 0 },
      update: {},
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
  }

  /**
   * Credit wallet — DB-enforced idempotency via @@unique([walletId, reference, type]).
   * If `reference` is omitted, a UUID is generated so non-idempotent callers still
   * satisfy the NOT NULL constraint (FINAL §9.4 C-003/R-003).
   */
  async credit(dto: CreditWalletDto) {
    const reference = dto.reference ?? `wallet:credit:${randomUUID()}`;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.upsert({
          where: { userId: dto.userId },
          create: { userId: dto.userId, balance: dto.amount },
          update: { balance: { increment: dto.amount } },
        });
        // V-09 FIX: enforce lifetime balance cap INSIDE the transaction so concurrent
        // credits can't both pass the pre-check and exceed the limit together.
        if (wallet.balance > MAX_WALLET_BALANCE) {
          throw new BadRequestException(
            `Wallet balance would exceed the maximum allowed limit of ₹${MAX_WALLET_BALANCE.toLocaleString('en-IN')}`,
          );
        }
        const txRecord = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            amount: dto.amount,
            type: WalletTxType.CREDIT,
            reference,
            description: dto.description,
            balanceAfter: wallet.balance,
          },
        });
        await tx.ledgerEntry.create({
          data: {
            type: LedgerType.WALLET_CREDIT,
            creditAmount: dto.amount,
            reference,
            description: dto.description,
          },
        });
        return txRecord;
      });
    } catch (e) {
      // Unique violation on (walletId, reference, CREDIT) → this credit already happened.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.prisma.walletTransaction.findFirst({
          where: { wallet: { userId: dto.userId }, reference, type: WalletTxType.CREDIT },
        });
        if (existing) return existing;
      }
      throw e;
    }
  }

  /**
   * Debit wallet — idempotent via reference uniqueness. Balance check + decrement
   * happen INSIDE the transaction via conditional updateMany to prevent overdraft races.
   */
  async debit(dto: DebitWalletDto) {
    const reference = dto.reference ?? `wallet:debit:${randomUUID()}`;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.findUnique({ where: { userId: dto.userId } });
        if (!wallet) throw new NotFoundException('Wallet not found');

        // Conditional decrement: only debits if balance is sufficient. No read-then-write race.
        const updated = await tx.wallet.updateMany({
          where: { id: wallet.id, balance: { gte: dto.amount } },
          data: { balance: { decrement: dto.amount } },
        });
        if (updated.count === 0) {
          throw new BadRequestException('Insufficient wallet balance');
        }
        const refreshed = await tx.wallet.findUnique({ where: { id: wallet.id } });

        const txRecord = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            amount: dto.amount,
            type: WalletTxType.DEBIT,
            reference,
            description: dto.description,
            balanceAfter: refreshed!.balance,
          },
        });
        await tx.ledgerEntry.create({
          data: {
            type: LedgerType.WALLET_DEBIT,
            debitAmount: dto.amount,
            reference,
            description: dto.description,
          },
        });
        return txRecord;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.prisma.walletTransaction.findFirst({
          where: { wallet: { userId: dto.userId }, reference, type: WalletTxType.DEBIT },
        });
        if (existing) return existing;
      }
      throw e;
    }
  }

  /** Refund to wallet after order cancellation/return (deterministic reference). */
  async refundToWallet(userId: number, amount: number, orderId: number) {
    return this.credit({
      userId,
      amount,
      reference: `refund:order:${orderId}`,
      description: `Refund for order #${orderId}`,
    });
  }

  /** Record a gateway payment for reconciliation */
  async recordGatewayPayment(dto: ReconcilePaymentDto) {
    // Find internal order amount
    let internalAmount: number | undefined;
    let discrepancy: number | undefined;
    let status: ReconcileStatus = ReconcileStatus.PENDING;

    if (dto.orderId) {
      const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
      if (order) {
        internalAmount = order.total;
        discrepancy = Math.abs(dto.gatewayAmount - (internalAmount ?? 0));
        status = discrepancy < 0.01 ? ReconcileStatus.MATCHED : ReconcileStatus.DISCREPANCY;
      }
    }

    return this.prisma.paymentReconciliation.upsert({
      where: { gatewayRef: dto.gatewayRef },
      create: {
        gatewayRef: dto.gatewayRef,
        orderId: dto.orderId,
        gatewayAmount: dto.gatewayAmount,
        internalAmount,
        discrepancy,
        status,
      },
      update: {
        gatewayAmount: dto.gatewayAmount,
        internalAmount,
        discrepancy,
        status,
      },
    });
  }

  async getReconciliationReport(from: Date, to: Date) {
    return this.prisma.paymentReconciliation.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: { order: { select: { id: true, total: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getLedger(from: Date, to: Date) {
    return this.prisma.ledgerEntry.findMany({
      where: { createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTransactionHistory(userId: number) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * COD reconciliation: delivery agent confirms cash received.
   * Marks the order as PAID and creates a reconciliation record.
   */
  async confirmCODDelivery(orderId: number, agentNote?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.paymentMethod !== 'COD') {
      throw new BadRequestException('Order is not a COD order');
    }
    if (order.paymentStatus === 'PAID') {
      throw new BadRequestException('COD already confirmed for this order');
    }

    const ref = `cod_confirm_${orderId}`;

    return this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'PAID', status: 'DELIVERED' },
      });

      await tx.paymentReconciliation.upsert({
        where: { gatewayRef: ref },
        create: {
          gatewayRef: ref,
          orderId,
          gatewayAmount: order.total,
          internalAmount: order.total,
          discrepancy: 0,
          status: 'MATCHED' as any,
        },
        update: { status: 'MATCHED' as any },
      });

      await tx.ledgerEntry.create({
        data: {
          type: 'ORDER_PAYMENT' as any,
          creditAmount: order.total,
          reference: ref,
          description: agentNote ?? `COD confirmed for order #${orderId}`,
        },
      });

      return { message: `COD of ₹${order.total} confirmed for order #${orderId}` };
    });
  }
}
