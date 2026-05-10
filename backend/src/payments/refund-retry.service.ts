import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { CronLockService } from '../common/cron-lock.service';

const MAX_REFUND_RETRIES = 5;
const RETRY_AFTER_MS = 60 * 60 * 1000; // 1 hour
const RETRY_BATCH_SIZE = 50;

/**
 * W5 PERF: refund retry cron.
 *
 * Picks up `RefundRequest` rows stuck in PROCESSING whose last update is older
 * than RETRY_AFTER_MS, re-calls Stripe, and either advances to COMPLETED or
 * increments retryCount. After MAX_REFUND_RETRIES attempts a row is marked
 * FAILED permanently and a WARN-level alert fires (ops will see it via logs).
 *
 * Runs at :15 past the hour with a distributed lock (M-005) so only one
 * replica fires per tick. Safe to run alongside the manual retry paths in
 * PaymentsService — the cron never touches rows already COMPLETED/FAILED.
 *
 * Invariant preserved: I-11 (RefundRequest row exists for every refund attempt)
 * and I-7 (∑ completed refund amount ≤ Order.total — because we never
 * duplicate-credit: Stripe itself is idempotent via gatewayRef).
 */
@Injectable()
export class RefundRetryService {
  private readonly logger = new Logger(RefundRetryService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cronLock: CronLockService,
  ) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2022-11-15',
    });
  }

  @Cron('15 * * * *') // hourly at :15
  async retryStuckRefunds(): Promise<void> {
    await this.cronLock.runExclusive('refund-retry', 55_000, async () => {
      const cutoff = new Date(Date.now() - RETRY_AFTER_MS);
      const stuck = await this.prisma.refundRequest.findMany({
        where: {
          status: 'PROCESSING',
          destination: 'ORIGINAL_PAYMENT',
          updatedAt: { lte: cutoff },
          retryCount: { lt: MAX_REFUND_RETRIES },
        },
        include: { order: { select: { id: true, paymentId: true, total: true } } },
        orderBy: { updatedAt: 'asc' },
        take: RETRY_BATCH_SIZE,
      });

      if (stuck.length === 0) return;
      this.logger.log(`Retrying ${stuck.length} stuck refund(s)`);

      for (const rr of stuck) {
        await this.retryOne(rr).catch((e) => {
          this.logger.error(`refund-retry loop error for rr=${rr.id}: ${e?.message ?? e}`);
        });
      }

      // W5-2: alert on rows that have now exhausted their retry budget.
      await this.markAndAlertPermanentFailures();
    });
  }

  private async retryOne(rr: {
    id: number;
    orderId: number;
    reference: string;
    amount: number;
    retryCount: number;
    order: { id: number; paymentId: string | null; total: number };
  }): Promise<void> {
    if (!rr.order.paymentId) {
      // Nothing to retry against — gateway intent is unknown. Mark FAILED.
      await this.prisma.refundRequest.update({
        where: { id: rr.id },
        data: {
          status: 'FAILED',
          failureReason: 'Order has no paymentId — cannot retry',
          retryCount: rr.retryCount + 1,
          lastRetryAt: new Date(),
        },
      });
      return;
    }

    const nextAttempt = rr.retryCount + 1;

    try {
      // Idempotency key per-attempt ensures Stripe treats each retry as a distinct call
      // while still de-duping client-level accidental double-posts.
      const refund = await this.stripe.refunds.create(
        {
          payment_intent: rr.order.paymentId,
          reason: 'requested_by_customer',
          metadata: { orderId: String(rr.orderId), refundRequestId: String(rr.id), retry: String(nextAttempt) },
        },
        { idempotencyKey: `${rr.reference}:attempt:${nextAttempt}` },
      );

      await this.prisma.refundRequest.update({
        where: { id: rr.id },
        data: {
          gatewayRef: refund.id,
          status: 'COMPLETED',
          processedAt: new Date(),
          retryCount: nextAttempt,
          lastRetryAt: new Date(),
          failureReason: null,
        },
      });
      await this.prisma.trackingEvent.create({
        data: {
          orderId: rr.orderId,
          status: 'CANCELLING' as any,
          note: `Refund retry #${nextAttempt} succeeded (${refund.id})`,
        },
      });
      this.logger.log(`Refund ${rr.id} recovered on retry #${nextAttempt}`);
    } catch (e: any) {
      const reason = String(e?.message ?? 'gateway error');
      await this.prisma.refundRequest.update({
        where: { id: rr.id },
        data: {
          retryCount: nextAttempt,
          lastRetryAt: new Date(),
          failureReason: reason,
        },
      });
      this.logger.warn(
        `Refund ${rr.id} retry #${nextAttempt}/${MAX_REFUND_RETRIES} failed: ${reason}`,
      );
    }
  }

  /**
   * W5-2: mark any PROCESSING row that has exhausted its retry budget as FAILED
   * and emit a WARN log so ops can triage. Conditional updateMany is idempotent:
   * a row that's already FAILED or COMPLETED won't be double-flipped.
   */
  private async markAndAlertPermanentFailures(): Promise<void> {
    const doomed = await this.prisma.refundRequest.findMany({
      where: {
        status: 'PROCESSING',
        retryCount: { gte: MAX_REFUND_RETRIES },
      },
      select: { id: true, orderId: true, amount: true, reference: true, failureReason: true },
    });
    for (const rr of doomed) {
      const flipped = await this.prisma.refundRequest.updateMany({
        where: { id: rr.id, status: 'PROCESSING' },
        data: { status: 'FAILED' },
      });
      if (flipped.count === 1) {
        // ALERT: human intervention required. Monitoring should pick up this WARN.
        this.logger.warn(
          `[REFUND_ALERT] RefundRequest #${rr.id} order=${rr.orderId} amount=${rr.amount} ` +
            `exhausted ${MAX_REFUND_RETRIES} retries. Last error: ${rr.failureReason ?? 'unknown'}. ` +
            `Manual refund or escalation required.`,
        );
        await this.prisma.trackingEvent.create({
          data: {
            orderId: rr.orderId,
            status: 'CANCELLING' as any,
            note: `Refund permanently failed after ${MAX_REFUND_RETRIES} retries. Manual action required.`,
          },
        });
      }
    }
  }
}
