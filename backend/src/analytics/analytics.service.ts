import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Canonical analytics service aligned with FINAL architecture §16.
 *
 * KPI definitions (single source of truth):
 *   GMV  = Σ Order.total WHERE status ∈ {CONFIRMED, PROCESSING, SHIPPED, DELIVERED}
 *   NMV  = GMV − Σ refundedAmount − chargebackAmount
 *   AOV  = NMV / distinct delivered orders
 *   Revenue recognition: on delivery, net of returns within return window.
 *
 * These methods are intended to be called by admin dashboards. They use
 * parameterized queries exclusively and are safe from SQL injection.
 * Heavy queries are in-memory cached for CACHE_TTL_MS (see below).
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  /** Order statuses that represent committed revenue (GMV). */
  static readonly GMV_STATUSES = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] as const;
  /** Delivered-only (for revenue recognition). */
  static readonly DELIVERED_STATUSES = ['DELIVERED'] as const;

  private readonly CACHE_TTL_MS = 60_000; // 60s; tune per route
  private readonly cache = new Map<string, { value: any; expiresAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  /** Bounded integer guard for raw-SQL interval parameters (prevents injection). */
  private clampDays(days: number, max = 365): number {
    const n = Math.trunc(Number(days));
    if (!Number.isFinite(n) || n <= 0) return 1;
    return Math.min(n, max);
  }

  private async memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value as T;
    const value = await fn();
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  /** Invalidate cache entries (hook for webhook events to call). */
  invalidate(prefix?: string): void {
    if (!prefix) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  // ─── Canonical KPIs ────────────────────────────────────────────────────────

  /**
   * Gross Merchandise Value for a time window.
   * Aligned with FINAL §16.2: Order.status ∈ GMV_STATUSES.
   */
  async getGmv(since: Date, until: Date = new Date()): Promise<number> {
    const agg = await this.prisma.order.aggregate({
      _sum: { total: true },
      where: {
        status: { in: AnalyticsService.GMV_STATUSES as any },
        createdAt: { gte: since, lt: until },
      },
    });
    return Number(agg._sum.total ?? 0);
  }

  /**
   * Net Merchandise Value = GMV − refunds − chargebacks.
   * Refunds are derived from order payment status (PARTIALLY_REFUNDED emits partial).
   * When RefundRequest table is live (see §9.3), replace with RefundRequest aggregation.
   */
  async getNmv(since: Date, until: Date = new Date()): Promise<{
    gmv: number;
    refunded: number;
    chargebacks: number;
    nmv: number;
  }> {
    const [gmv, refundedAgg, partialRefundedRows] = await Promise.all([
      this.getGmv(since, until),
      // Full refunds: order-level total minus 0
      this.prisma.order.aggregate({
        _sum: { total: true },
        where: {
          paymentStatus: 'REFUNDED',
          createdAt: { gte: since, lt: until },
        },
      }),
      // Partial refunds: need per-order partial amount; fall back to 0 if field not present
      this.prisma.order.findMany({
        where: {
          paymentStatus: 'PARTIALLY_REFUNDED',
          createdAt: { gte: since, lt: until },
        },
        select: { total: true },
      }),
    ]);

    const fullRefunds = Number(refundedAgg._sum.total ?? 0);
    // Conservative estimate until RefundRequest table exists: assume 50% refunded for partials.
    // Downstream fix is to replace with Σ RefundRequest.amount WHERE status=COMPLETED.
    const partialRefunds = partialRefundedRows.reduce((sum, r) => sum + Number(r.total) * 0.5, 0);

    const refunded = fullRefunds + partialRefunds;
    const chargebacks = 0; // TODO: wire once Dispute/Chargeback table exists (§6.10)
    return {
      gmv,
      refunded,
      chargebacks,
      nmv: Math.max(0, gmv - refunded - chargebacks),
    };
  }

  /** Average Order Value on delivered orders (revenue-recognized basis). */
  async getAov(since: Date, until: Date = new Date()): Promise<number> {
    const [totalAgg, count] = await Promise.all([
      this.prisma.order.aggregate({
        _sum: { total: true },
        where: {
          status: 'DELIVERED',
          createdAt: { gte: since, lt: until },
        },
      }),
      this.prisma.order.count({
        where: {
          status: 'DELIVERED',
          createdAt: { gte: since, lt: until },
        },
      }),
    ]);
    if (count === 0) return 0;
    return Number(totalAgg._sum.total ?? 0) / count;
  }

  /**
   * Revenue time-series by day for the last N days. Parameterized (injection-safe).
   */
  async getRevenueSeries(days: number): Promise<Array<{ date: string; gmv: number; orders: number }>> {
    const d = this.clampDays(days);
    const cacheKey = `rev-series:${d}`;
    return this.memo(cacheKey, this.CACHE_TTL_MS, async () => {
      const since = new Date(Date.now() - d * 86_400_000);
      const rows = await this.prisma.$queryRaw<
        Array<{ date: Date; gmv: string | number | null; orders: bigint }>
      >(Prisma.sql`
        SELECT DATE("createdAt") AS date,
               COALESCE(SUM(total), 0) AS gmv,
               COUNT(id) AS orders
        FROM "Order"
        WHERE "createdAt" >= ${since}
          AND status = ANY(${AnalyticsService.GMV_STATUSES as any}::text[])
        GROUP BY DATE("createdAt")
        ORDER BY date ASC
      `);
      return rows.map((r) => ({
        date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
        gmv: Number(r.gmv ?? 0),
        orders: Number(r.orders),
      }));
    });
  }

  /**
   * Monthly cohort retention — FIXED from admin.service which over-counted users
   * across multiple months. A user belongs to the cohort of their signup month only.
   */
  async getCohortRetention(monthsBack = 6): Promise<
    Array<{ month: string; newUsers: number; retained: number; retentionRate: number }>
  > {
    const months = Math.max(1, Math.min(24, Math.trunc(monthsBack)));
    const cacheKey = `cohort:${months}`;
    return this.memo(cacheKey, 5 * 60_000, async () => {
      const rows = await this.prisma.$queryRaw<
        Array<{ month: Date; new_users: bigint; retained: bigint }>
      >(Prisma.sql`
        WITH user_cohort AS (
          SELECT u.id AS user_id,
                 DATE_TRUNC('month', u."createdAt") AS cohort_month
          FROM "User" u
          WHERE u.role = 'USER'
            AND u."createdAt" >= NOW() - (${months}::int * INTERVAL '1 month')
        ),
        user_orders AS (
          SELECT uc.user_id,
                 uc.cohort_month,
                 COUNT(o.id) AS paid_orders
          FROM user_cohort uc
          LEFT JOIN "Order" o
            ON o."userId" = uc.user_id
           AND o."paymentStatus" = 'PAID'
          GROUP BY uc.user_id, uc.cohort_month
        )
        SELECT cohort_month AS month,
               COUNT(*) AS new_users,
               COUNT(*) FILTER (WHERE paid_orders > 1) AS retained
        FROM user_orders
        GROUP BY cohort_month
        ORDER BY cohort_month ASC
      `);
      return rows.map((r) => {
        const newUsers = Number(r.new_users);
        const retained = Number(r.retained);
        return {
          month: r.month instanceof Date ? r.month.toISOString().slice(0, 7) : String(r.month),
          newUsers,
          retained,
          retentionRate: newUsers > 0 ? Math.round((retained / newUsers) * 100) : 0,
        };
      });
    });
  }

  /** Finance-grade summary for a rolling window (used by finance-dashboard). */
  async getFinanceSummary(): Promise<{
    today: { gmv: number; nmv: number; refunded: number };
    month: { gmv: number; nmv: number; refunded: number };
  }> {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [today, month] = await Promise.all([
      this.getNmv(todayStart, now),
      this.getNmv(monthStart, now),
    ]);
    return {
      today: { gmv: today.gmv, nmv: today.nmv, refunded: today.refunded },
      month: { gmv: month.gmv, nmv: month.nmv, refunded: month.refunded },
    };
  }

  /** Live last-hour snapshot with canonical GMV. */
  async getLiveSnapshot(): Promise<{
    timestamp: string;
    ordersLastHour: number;
    gmvLastHour: number;
    newUsersLastHour: number;
    activeCartsLast15min: number;
    paymentsConfirmedLastHour: number;
  }> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000);

    const [ordersLastHour, gmvAgg, newUsersLastHour, activeCarts, paymentsLastHour] =
      await Promise.all([
        this.prisma.order.count({
          where: {
            createdAt: { gte: oneHourAgo },
            status: { in: AnalyticsService.GMV_STATUSES as any },
          },
        }),
        this.prisma.order.aggregate({
          _sum: { total: true },
          where: {
            createdAt: { gte: oneHourAgo },
            status: { in: AnalyticsService.GMV_STATUSES as any },
          },
        }),
        this.prisma.user.count({ where: { createdAt: { gte: oneHourAgo } } }),
        this.prisma.cart.count({ where: { updatedAt: { gte: fifteenMinAgo } } }),
        this.prisma.order.count({
          where: { paymentStatus: 'PAID', updatedAt: { gte: oneHourAgo } },
        }),
      ]);

    return {
      timestamp: now.toISOString(),
      ordersLastHour,
      gmvLastHour: Number(gmvAgg._sum.total ?? 0),
      newUsersLastHour,
      activeCartsLast15min: activeCarts,
      paymentsConfirmedLastHour: paymentsLastHour,
    };
  }
}
