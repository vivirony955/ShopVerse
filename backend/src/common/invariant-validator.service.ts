// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CronLockService } from './cron-lock.service';

/**
 * Runtime invariant validators — FINAL §2 I-1, I-2, I-3, I-7, I-13.
 *
 * These crons do NOT mutate data. They detect drift between authoritative
 * tables and their caches/aggregates, log WARN on violations, and emit one
 * structured alert line per violating row so ops can pipe to Sentry/PagerDuty.
 *
 * A violation here means a bug upstream (a mutation path bypassed the
 * transactional guards). The cron is a last-line detector, not a fixer.
 */
@Injectable()
export class InvariantValidatorService {
  private readonly logger = new Logger(InvariantValidatorService.name);
  // O-07: heartbeat map for ops observability. Ops alerting can poll this
  // (via an admin endpoint) and page if any cron's lastRunAt falls behind its
  // expected cadence. Stored in-memory — good enough for single-pod detection;
  // multi-pod rollup goes via log aggregation on the `[INVARIANT_ALERT]` prefix.
  private readonly heartbeats = new Map<
    string,
    {
      lastRunAt: Date;
      lastStatus: 'OK' | 'VIOLATIONS' | 'ERROR';
      violationCount: number;
    }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cronLock: CronLockService,
  ) {}

  /**
   * O-07: wrap every invariant cron so a thrown error (DB down, CTE failure,
   * etc.) emits a structured ALERT instead of silently killing the scheduler.
   * Also updates the heartbeat map for observability.
   */
  private async runValidator(
    name: string,
    body: () => Promise<number | undefined>, // violation count, or undefined if lock was held by another pod
  ): Promise<void> {
    try {
      const rawCount = await body();
      // Lock held by another pod → treat as no-op for heartbeat (other pod will update it).
      if (rawCount === undefined) return;
      const violationCount = rawCount;
      const status = violationCount === 0 ? 'OK' : 'VIOLATIONS';
      this.heartbeats.set(name, {
        lastRunAt: new Date(),
        lastStatus: status,
        violationCount,
      });
      if (violationCount > 0) {
        this.logger.warn(
          `[INVARIANT_ALERT] validator=${name} violations=${violationCount}`,
        );
      }
    } catch (e: unknown) {
      this.heartbeats.set(name, {
        lastRunAt: new Date(),
        lastStatus: 'ERROR',
        violationCount: -1,
      });
      // ERROR level — the cron itself failed. Ops must investigate.
      this.logger.error(
        `[INVARIANT_ALERT] validator=${name} status=ERROR reason=${e instanceof Error ? e.message : String(e)}`,
        e instanceof Error ? e.stack : undefined,
      );
    }
  }

  /** Exposed for an admin/health endpoint so monitoring can poll run freshness. */
  getHeartbeats(): Record<
    string,
    { lastRunAt: Date; lastStatus: string; violationCount: number }
  > {
    return Object.fromEntries(this.heartbeats);
  }

  /**
   * I-1 + I-2 (stock cache & reservation tallies).
   * I-1: sum(WarehouseInventory.stock) per variant == Variant.stock
   * I-2: sum(WarehouseInventory.reserved) per variant == Variant.reservedStock
   *      == sum(OrderItem.qty) for orders in pre-fulfilment statuses.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async validateInventoryInvariants(): Promise<void> {
    await this.runValidator('inventory', () =>
      this.cronLock.runExclusive(
        'invariant-inventory',
        14 * 60_000,
        async () => {
          // I-1/I-2 cache drift
          const drift = await this.prisma.$queryRaw<
            {
              variantId: number;
              cacheStock: number;
              whStock: number;
              cacheReserved: number;
              whReserved: number;
            }[]
          >`
        SELECT v.id AS "variantId",
               v."stock" AS "cacheStock",
               COALESCE(SUM(wi."stock"), 0)::int AS "whStock",
               v."reservedStock" AS "cacheReserved",
               COALESCE(SUM(wi."reserved"), 0)::int AS "whReserved"
        FROM "Variant" v
        LEFT JOIN "WarehouseInventory" wi ON wi."variantId" = v.id
        GROUP BY v.id
        HAVING v."stock" <> COALESCE(SUM(wi."stock"), 0)::int
            OR v."reservedStock" <> COALESCE(SUM(wi."reserved"), 0)::int
      `;
          for (const d of drift) {
            this.logger.warn(
              `I-1/I-2 drift variantId=${d.variantId} cacheStock=${d.cacheStock} vs whStock=${d.whStock}, ` +
                `cacheReserved=${d.cacheReserved} vs whReserved=${d.whReserved}`,
            );
          }

          // I-2 cross-check against OrderItem for active-order reserves.
          // BUG-FIX: original LEFT JOIN on Order with status filter left oi.*
          // in the result set when the order didn't match (REFUNDED, CANCELLED),
          // so SUM counted items from ALL orders. CASE WHEN ensures only items
          // from active-status orders are summed.
          const ordDrift = await this.prisma.$queryRaw<
            {
              variantId: number;
              cacheReserved: number;
              activeOrderQty: number;
            }[]
          >`
        SELECT v.id AS "variantId", v."reservedStock" AS "cacheReserved",
               COALESCE(SUM(
                 CASE WHEN o."status" IN ('PENDING','CONFIRMED','PROCESSING','PACKED','SHIPPED')
                      THEN oi."quantity" ELSE 0 END
               ), 0)::int AS "activeOrderQty"
        FROM "Variant" v
        LEFT JOIN "OrderItem" oi ON oi."variantId" = v.id AND oi."cancelledAt" IS NULL
        LEFT JOIN "Order" o ON o.id = oi."orderId"
        GROUP BY v.id
        HAVING v."reservedStock" < COALESCE(SUM(
                 CASE WHEN o."status" IN ('PENDING','CONFIRMED','PROCESSING','PACKED','SHIPPED')
                      THEN oi."quantity" ELSE 0 END
               ), 0)::int
      `;
          for (const d of ordDrift) {
            this.logger.warn(
              `I-2 violation variantId=${d.variantId}: reservedStock=${d.cacheReserved} < activeOrderQty=${d.activeOrderQty}`,
            );
          }

          if (drift.length === 0 && ordDrift.length === 0) {
            this.logger.log('I-1/I-2 invariants OK');
          }
          return drift.length + ordDrift.length;
        },
      ),
    );
  }

  /**
   * I-3: sum(WalletTransaction signed) per wallet == Wallet.balance.
   * CREDIT contributes +amount; DEBIT contributes -amount.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async validateWalletTrialBalance(): Promise<void> {
    await this.runValidator('wallet-trial', () =>
      this.cronLock.runExclusive(
        'invariant-wallet-trial',
        9 * 60_000,
        async () => {
          const diffs = await this.prisma.$queryRaw<
            { walletId: number; balance: number; ledger: number }[]
          >`
        SELECT w.id AS "walletId", w."balance",
               COALESCE(SUM(CASE WHEN t."type" = 'CREDIT' THEN t."amount"
                                 WHEN t."type" = 'DEBIT'  THEN -t."amount"
                                 ELSE 0 END), 0) AS "ledger"
        FROM "Wallet" w
        LEFT JOIN "WalletTransaction" t ON t."walletId" = w.id
        GROUP BY w.id, w."balance"
        HAVING ABS(w."balance" - COALESCE(SUM(CASE WHEN t."type" = 'CREDIT' THEN t."amount"
                                                   WHEN t."type" = 'DEBIT'  THEN -t."amount"
                                                   ELSE 0 END), 0)) > 0.01
      `;
          for (const d of diffs) {
            this.logger.warn(
              `I-3 trial-balance mismatch walletId=${d.walletId} balance=${d.balance} ledger=${d.ledger}`,
            );
          }
          if (diffs.length === 0) this.logger.log('I-3 trial balance OK');
          return diffs.length;
        },
      ),
    );
  }

  /**
   * I-7: every order with paymentStatus ∈ {REFUNDED, PARTIALLY_REFUNDED} must
   * have ∑(RefundRequest.amount WHERE status=COMPLETED) ≤ Order.total.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async validateRefundAmounts(): Promise<void> {
    await this.runValidator('refund-amounts', () =>
      this.cronLock.runExclusive(
        'invariant-refund-amounts',
        9 * 60_000,
        async () => {
          const violations = await this.prisma.$queryRaw<
            { orderId: number; total: number; refunded: number }[]
          >`
        SELECT o.id AS "orderId", o."total",
               COALESCE(SUM(r."amount"), 0) AS "refunded"
        FROM "Order" o
        LEFT JOIN "RefundRequest" r ON r."orderId" = o.id AND r."status" = 'COMPLETED'
        WHERE o."paymentStatus" IN ('REFUNDED', 'PARTIALLY_REFUNDED')
        GROUP BY o.id, o."total"
        HAVING COALESCE(SUM(r."amount"), 0) > o."total" + 0.01
      `;
          for (const v of violations) {
            this.logger.error(
              `I-7 VIOLATION: orderId=${v.orderId} refunded=${v.refunded} > total=${v.total}`,
            );
          }
          if (violations.length === 0) this.logger.log('I-7 refund bounds OK');
          return violations.length;
        },
      ),
    );
  }

  /**
   * I-5 runtime check: sum(OrderItem.price * qty) − discountAmount == Order.total
   * (within 1¢). The CHECK constraint covers inequality bounds; this cron covers
   * equality against the line-items aggregate.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async validateOrderTotals(): Promise<void> {
    await this.runValidator('order-totals', () =>
      this.cronLock.runExclusive(
        'invariant-order-totals',
        9 * 60_000,
        async () => {
          const mismatches = await this.prisma.$queryRaw<
            { orderId: number; total: number; computed: number }[]
          >`
        SELECT o.id AS "orderId", o."total",
               (COALESCE(SUM(oi."price" * oi."quantity"), 0)
                - o."discountAmount"
                + o."shippingFee"
                + o."taxAmount") AS "computed"
        FROM "Order" o
        LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id AND oi."cancelledAt" IS NULL
        GROUP BY o.id, o."total", o."discountAmount", o."shippingFee", o."taxAmount"
        HAVING ABS(o."total" - (COALESCE(SUM(oi."price" * oi."quantity"), 0)
                                - o."discountAmount"
                                + o."shippingFee"
                                + o."taxAmount")) > 0.01
      `;
          for (const m of mismatches) {
            this.logger.warn(
              `I-5 drift orderId=${m.orderId} stored=${m.total} computed=${m.computed}`,
            );
          }
          if (mismatches.length === 0)
            this.logger.log('I-5 order-total formula OK');
          return mismatches.length;
        },
      ),
    );
  }

  /**
   * I-13: Invoice sequence number is continuous per financial year (no gaps).
   * A gap = MAX(sequence) - COUNT(*) > 0 for any financial year.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async validateInvoiceSequence(): Promise<void> {
    await this.runValidator('invoice-seq', () =>
      this.cronLock.runExclusive(
        'invariant-invoice-seq',
        9 * 60_000,
        async () => {
          const gaps = await this.prisma.$queryRaw<
            {
              financialYear: string;
              maxSeq: number;
              count: number;
              gaps: number;
            }[]
          >`
        SELECT "financialYear",
               MAX("sequence") AS "maxSeq",
               COUNT(*)::int   AS "count",
               (MAX("sequence") - COUNT(*)::int) AS "gaps"
        FROM "Invoice"
        GROUP BY "financialYear"
        HAVING MAX("sequence") - COUNT(*)::int > 0
      `;
          for (const g of gaps) {
            this.logger.error(
              `I-13 VIOLATION: financialYear=${g.financialYear} maxSeq=${g.maxSeq} count=${g.count} gaps=${g.gaps}`,
            );
          }
          if (gaps.length === 0) this.logger.log('I-13 invoice sequence OK');
          return gaps.length;
        },
      ),
    );
  }
}
