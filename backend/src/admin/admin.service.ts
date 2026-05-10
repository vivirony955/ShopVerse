// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';
import { AnalyticsService } from '../analytics/analytics.service';
import { CronLockService } from '../common/cron-lock.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
    private readonly analytics: AnalyticsService,
    private readonly cronLock: CronLockService,
    private readonly walletService: WalletService,
  ) {}

  async getDashboardStats() {
    // Canonical GMV (FINAL §16.2): Order.status ∈ {CONFIRMED, PROCESSING, SHIPPED, DELIVERED}.
    // Legacy `totalRevenue` is preserved for API backward-compat but now reflects canonical GMV.
    const [totalOrders, totalUsers, totalProducts, gmvAgg, recentOrders, orderStatusBreakdown, topProducts] =
      await Promise.all([
        this.prisma.order.count(),
        this.prisma.user.count({ where: { role: 'USER' } }),
        this.prisma.product.count({ where: { isActive: true } }),
        this.prisma.order.aggregate({
          _sum: { total: true },
          where: { status: { in: AnalyticsService.GMV_STATUSES as any } },
        }),
        this.prisma.order.findMany({
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { email: true, firstName: true } } },
        }),
        this.prisma.order.groupBy({ by: ['status'], _count: { id: true } }),
        this.prisma.orderItem.groupBy({
          by: ['variantId'],
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 5,
        }),
      ]);

    const revenueByDay = await this.analytics.getRevenueSeries(30);
    const lowStockVariants = await this.getLowStockVariants(5);

    return {
      totalOrders,
      totalRevenue: Number(gmvAgg._sum.total ?? 0), // kept for API compat; = GMV
      totalGmv: Number(gmvAgg._sum.total ?? 0),
      totalUsers,
      totalProducts,
      recentOrders,
      orderStatusBreakdown,
      revenueByDay, // shape now: { date, gmv, orders }
      topProducts,
      lowStockCount: lowStockVariants.length,
    };
  }

  getLowStockVariants(threshold = 5) {
    return this.prisma.variant.findMany({
      where: { stock: { lte: threshold, gt: 0 } },
      include: { product: { select: { id: true, name: true, slug: true } } },
      orderBy: { stock: 'asc' },
    });
  }

  getOutOfStockVariants() {
    return this.prisma.variant.findMany({
      where: { stock: 0 },
      include: { product: { select: { id: true, name: true, slug: true } } },
    });
  }

  /**
   * Daily revenue report. Delegates to AnalyticsService for canonical GMV and
   * parameter-safe interval handling (previous implementation had SQL-injection
   * via string-interpolated days).
   */
  async getRevenueReport(days = 30) {
    const series = await this.analytics.getRevenueSeries(days);
    // Back-compat response shape: { date, revenue, orders }
    return series.map((r) => ({ date: r.date, revenue: r.gmv, orders: r.orders }));
  }

  @Cron('0 9 * * *') // Daily at 9 AM
  async sendLowStockAlertEmail() {
    // FINAL §9.4 R-010 / M-005: single-fire per tick across replicas.
    await this.cronLock.runExclusive('low-stock-alert-daily', 30 * 60_000, async () => {
      const adminEmail = this.config.get<string>('SEED_ADMIN_EMAIL');
      if (!adminEmail) return;
      const variants = await this.getLowStockVariants(5);
      if (variants.length === 0) return;
      await this.emailService.sendLowStockAlert({ adminEmail, variants });
    });
  }

  /**
   * Finance dashboard: canonical GMV/NMV (FINAL §16.2), refunds netted, wallet totals,
   * reconciliation summary. Refunds include PARTIALLY_REFUNDED estimate until
   * RefundRequest table is live (see §9.3).
   */
  async getFinanceDashboard() {
    const [
      finance, // { today, month } with canonical gmv/nmv/refunded
      pendingReconciliation,
      discrepancies,
      totalWalletBalance,
      topAffiliates,
    ] = await Promise.all([
      this.analytics.getFinanceSummary(),
      this.prisma.paymentReconciliation.count({ where: { status: 'PENDING' } }),
      this.prisma.paymentReconciliation.count({ where: { status: 'DISCREPANCY' } }),
      this.prisma.wallet.aggregate({ _sum: { balance: true } }),
      this.prisma.affiliateAccount.findMany({
        orderBy: { totalEarned: 'desc' },
        take: 5,
        include: { user: { select: { email: true, firstName: true } } },
      }),
    ]);

    return {
      // Back-compat fields (gmv-equivalent, since legacy naming said "revenue")
      revenue: {
        today: finance.today.gmv,
        thisMonth: finance.month.gmv,
      },
      // Canonical KPIs (new)
      kpis: {
        today: finance.today, // { gmv, nmv, refunded }
        month: finance.month,
      },
      refunds: {
        totalRefunded: finance.month.refunded,
        todayRefunded: finance.today.refunded,
      },
      reconciliation: { pending: pendingReconciliation, discrepancies },
      wallet: { totalIssuedBalance: totalWalletBalance._sum.balance ?? 0 },
      topAffiliates,
    };
  }

  /** Ops dashboard: shipment status, SLA violations, pending orders */
  async getOpsDashboard() {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const [
      pendingOrders,
      processingOrders,
      shipmentsInTransit,
      overdueShipments,
      openSupportTickets,
      codPendingConfirmation,
    ] = await Promise.all([
      this.prisma.order.count({ where: { status: 'PENDING' } }),
      this.prisma.order.count({ where: { status: 'PROCESSING' } }),
      this.prisma.shipment.count({ where: { status: 'IN_TRANSIT' } }).catch(() => 0),
      // Shipments in transit for > 2 days = potentially overdue
      this.prisma.shipment
        .count({ where: { status: 'IN_TRANSIT', updatedAt: { lte: twoDaysAgo } } })
        .catch(() => 0),
      this.prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      this.prisma.order.count({ where: { paymentMethod: 'COD', paymentStatus: 'UNPAID', status: 'DELIVERED' } }),
    ]);

    return {
      orders: { pending: pendingOrders, processing: processingOrders },
      shipments: { inTransit: shipmentsInTransit, overdue: overdueShipments },
      support: { openTickets: openSupportTickets },
      cod: { pendingConfirmation: codPendingConfirmation },
    };
  }

  /**
   * Customer analytics: LTV, repeat vs new, RFM segmentation.
   * Segments:
   *   Champions    — ordered recently, high frequency, high spend
   *   Loyal        — high frequency, decent spend
   *   At Risk      — once-big spenders who haven't ordered in 60+ days
   *   Lost         — no order in 90+ days
   *   New          — first order in last 30 days
   */
  async getCustomerAnalytics() {
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const d60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [
      totalCustomers,
      newCustomers30d,
      repeatCount,
      avgLtv,
      topCustomers,
      cohortRetention,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: 'USER' } }),

      // New customers: first order within last 30 days (users whose earliest order is recent)
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM "User"
        WHERE role = 'USER'
        AND (SELECT MIN("createdAt") FROM "Order" WHERE "userId" = "User".id) >= ${d30}
      `,

      // Repeat customers: placed > 1 order
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM (
          SELECT "userId" FROM "Order" GROUP BY "userId" HAVING COUNT(id) > 1
        ) t
      `,

      // Average LTV across all paying customers
      this.prisma.$queryRaw<{ avg_ltv: number }[]>`
        SELECT AVG(total_spend) as avg_ltv FROM (
          SELECT "userId", SUM(total) as total_spend
          FROM "Order" WHERE "paymentStatus" = 'PAID'
          GROUP BY "userId"
        ) t
      `,

      // Top 10 customers by LTV
      this.prisma.$queryRaw<{ userId: number; email: string; firstName: string; total_spend: number; order_count: bigint }[]>`
        SELECT u.id as "userId", u.email, u."firstName", SUM(o.total) as total_spend, COUNT(o.id) as order_count
        FROM "User" u
        JOIN "Order" o ON o."userId" = u.id
        WHERE o."paymentStatus" = 'PAID'
        GROUP BY u.id, u.email, u."firstName"
        ORDER BY total_spend DESC
        LIMIT 10
      `,

      // Monthly cohort retention — delegates to AnalyticsService which has the
      // corrected cohort query (users attributed to signup-month only).
      this.analytics.getCohortRetention(6),
    ]);

    // RFM segmentation
    const rfmRaw = await this.prisma.$queryRaw<{
      userId: number; email: string; firstName: string;
      last_order: Date; order_count: bigint; total_spend: number;
    }[]>`
      SELECT u.id as "userId", u.email, u."firstName",
        MAX(o."createdAt") as last_order,
        COUNT(o.id) as order_count,
        COALESCE(SUM(o.total), 0) as total_spend
      FROM "User" u
      LEFT JOIN "Order" o ON o."userId" = u.id AND o."paymentStatus" = 'PAID'
      WHERE u.role = 'USER'
      GROUP BY u.id, u.email, u."firstName"
    `;

    const segments = { champions: 0, loyal: 0, atRisk: 0, lost: 0, newCustomers: 0, others: 0 };
    for (const r of rfmRaw) {
      const lastOrder = r.last_order ? new Date(r.last_order) : null;
      const count = Number(r.order_count);
      const spend = r.total_spend;
      if (!lastOrder || count === 0) { segments.others++; continue; }
      const daysSince = (now.getTime() - lastOrder.getTime()) / 86400000;
      if (daysSince <= 30 && count >= 3 && spend > 2000) { segments.champions++; }
      else if (count >= 2 && daysSince <= 60) { segments.loyal++; }
      else if (daysSince > 60 && daysSince <= 90 && spend > 1000) { segments.atRisk++; }
      else if (daysSince > 90) { segments.lost++; }
      else if (daysSince <= 30 && count === 1) { segments.newCustomers++; }
      else { segments.others++; }
    }

    return {
      overview: {
        totalCustomers,
        newCustomers30d: Number((newCustomers30d[0] as any)?.count ?? 0),
        repeatCustomers: Number((repeatCount[0] as any)?.count ?? 0),
        avgLtv: Number((avgLtv[0] as any)?.avg_ltv ?? 0),
      },
      segments,
      topCustomers: topCustomers.map((c) => ({
        ...c,
        order_count: Number(c.order_count),
      })),
      // AnalyticsService already returns the correct shape.
      cohortRetention,
    };
  }

  updateOrderStatus(orderId: number, status: string) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: status as any },
    });
  }

  /** All orders — admin view with pagination and status filter */
  async getAllOrders(filters: { status?: string; page?: number; limit?: number; requestedBy: number }) {
    const { status, page = 1, requestedBy } = filters;
    // H2-07: hard cap at 100 rows per request — prevents full-table silent exfiltration
    const limit = Math.min(Number(filters.limit ?? 30), 100);
    const skip = (Number(page) - 1) * limit;
    const where: any = {};
    if (status) where.status = status;

    // H2-08: audit every export for insider threat detection (T-AD04 fix)
    await this.prisma.adminAuditLog.create({
      data: {
        adminId: requestedBy,
        action: 'EXPORT_ORDERS',
        entity: 'Order',
        method: 'GET',
        url: '/admin/orders',
        body: { page, limit, status: status ?? 'ALL' },
      },
    });

    return this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        items: { select: { id: true, quantity: true, price: true } },
      },
    });
  }

  /** All users — admin view with pagination */
  async getAllUsers(filters: { page?: number; limit?: number; search?: string; requestedBy: number }) {
    const { page = 1, search, requestedBy } = filters;
    // H2-07: hard cap at 100 rows per request
    const limit = Math.min(Number(filters.limit ?? 30), 100);
    const skip = (Number(page) - 1) * limit;
    const where: any = { role: 'USER' };
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    // H2-08: audit every user-list export
    await this.prisma.adminAuditLog.create({
      data: {
        adminId: requestedBy,
        action: 'EXPORT_USERS',
        entity: 'User',
        method: 'GET',
        url: '/admin/users',
        body: { page, limit, search: search ?? '' },
      },
    });

    return this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        phone: true, createdAt: true, loyaltyPoints: true,
        _count: { select: { orders: true } },
      },
    });
  }

  /** Audit log: recent admin mutations, filterable by entity or adminId */
  getAuditLogs(limit = 100, entity?: string, adminId?: number) {
    return this.prisma.adminAuditLog.findMany({
      where: {
        ...(entity && { entity }),
        ...(adminId && { adminId }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { admin: { select: { id: true, email: true, firstName: true } } },
    });
  }

  /**
   * Funnel analytics: cart → order → confirmed/committed → delivered.
   * NOTE: "checkoutStarted" currently shares the same source as "ordersPlaced"
   * because no client-side event stream is wired yet; when EventLog is live
   * (FINAL §14.4), replace with distinct pageview/checkout-start events.
   */
  async getFunnelAnalytics(days = 7) {
    const d = Math.max(1, Math.min(90, Math.trunc(days)));
    const since = new Date(Date.now() - d * 86_400_000);

    const [
      activeCarts,
      ordersPlaced,
      ordersCommitted,
      ordersDelivered,
    ] = await Promise.all([
      // Carts touched in the window (proxy for add-to-cart activity)
      this.prisma.cart.count({ where: { updatedAt: { gte: since } } }),
      // All orders created in window
      this.prisma.order.count({ where: { createdAt: { gte: since } } }),
      // Committed orders per canonical GMV statuses (FINAL §16.2)
      this.prisma.order.count({
        where: {
          createdAt: { gte: since },
          status: { in: AnalyticsService.GMV_STATUSES as any },
        },
      }),
      // Revenue-recognized (delivered)
      this.prisma.order.count({
        where: { createdAt: { gte: since }, status: 'DELIVERED' },
      }),
    ]);

    const pct = (num: number, den: number) =>
      den > 0 ? Math.round((num / den) * 100) : 0;

    return {
      windowDays: d,
      funnel: [
        { stage: 'Active Carts', count: activeCarts },
        { stage: 'Order Placed', count: ordersPlaced },
        { stage: 'Order Committed', count: ordersCommitted },
        { stage: 'Order Delivered', count: ordersDelivered },
      ],
      conversionRates: {
        // Back-compat fields kept
        cartToCheckout: pct(ordersPlaced, activeCarts),
        checkoutToPurchase: pct(ordersCommitted, ordersPlaced),
        overallConversion: pct(ordersDelivered, activeCarts),
        // New canonical fields
        cartToOrder: pct(ordersPlaced, activeCarts),
        orderToCommit: pct(ordersCommitted, ordersPlaced),
        commitToDeliver: pct(ordersDelivered, ordersCommitted),
      },
    };
  }

  /** Real-time metrics: last-hour activity snapshot (canonical GMV). */
  async getLiveMetrics() {
    const snap = await this.analytics.getLiveSnapshot();
    // Back-compat: expose `revenueLastHour` alias of canonical `gmvLastHour`.
    return {
      timestamp: snap.timestamp,
      ordersLastHour: snap.ordersLastHour,
      revenueLastHour: snap.gmvLastHour,
      gmvLastHour: snap.gmvLastHour,
      newUsersLastHour: snap.newUsersLastHour,
      activeCartsLast15min: snap.activeCartsLast15min,
      paymentsConfirmedLastHour: snap.paymentsConfirmedLastHour,
    };
  }

  // ─── Maker-Checker: High-Value Refund Approval (ADM-RBAC §16.2) ─────────────

  static readonly HIGH_VALUE_THRESHOLD = 5000; // ₹5000

  /**
   * CS_AGENT requests a refund > ₹5000. Creates a RefundApproval row (PENDING).
   * A FINANCE-role user must call approveRefundRequest() to execute it.
   */
  async requestHighValueRefund(
    orderId: number,
    amount: number,
    reason: string,
    requestedBy: number,
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    if (amount <= AdminService.HIGH_VALUE_THRESHOLD) {
      throw new BadRequestException(`Amount ₹${amount} is ≤ threshold ₹${AdminService.HIGH_VALUE_THRESHOLD} — process directly`);
    }

    return this.prisma.refundApproval.create({
      data: { orderId, amount, reason, requestedBy },
    });
  }

  /** FINANCE role: approve and execute a pending high-value refund (V-01 fix). */
  async approveRefundRequest(approvalId: number, approvedBy: number) {
    const approval = await this.prisma.refundApproval.findUnique({
      where: { id: approvalId },
      include: { order: true },
    });
    if (!approval) throw new NotFoundException(`RefundApproval ${approvalId} not found`);
    if (approval.status !== 'PENDING') {
      throw new BadRequestException(`Approval ${approvalId} is already ${approval.status}`);
    }
    // T-AD01 FIX: maker-checker — approver must be a different person than the requester
    if (approval.requestedBy === approvedBy) {
      throw new ForbiddenException('Self-approval is not permitted. A different FINANCE user must approve this request.');
    }

    // V-01 FIX: approval must actually execute the refund (not just update status).
    // I-11: create RefundRequest row BEFORE crediting wallet so every money movement has a record.
    const reference = `admin:refund:approval:${approvalId}`;
    const refundRequest = await this.prisma.refundRequest.upsert({
      where: { reference },
      create: {
        orderId: approval.orderId,
        amount: approval.amount,
        reason: approval.reason,
        status: 'PROCESSING',
        destination: 'WALLET',
        reference,
        requestedById: approvedBy,
      },
      update: { status: 'PROCESSING' },
    });

    // Execute the wallet credit (guest orders have no userId — fall back to manual process)
    if (!approval.order.userId) {
      throw new BadRequestException('Order has no registered user — cannot credit wallet. Process refund manually.');
    }
    await this.walletService.refundToWallet(approval.order.userId, approval.amount, approval.orderId);

    // Mark RefundRequest as COMPLETED and RefundApproval as EXECUTED atomically
    await this.prisma.$transaction([
      this.prisma.refundRequest.update({
        where: { id: refundRequest.id },
        data: { status: 'COMPLETED', processedAt: new Date() },
      }),
      this.prisma.refundApproval.update({
        where: { id: approvalId },
        data: {
          status: 'EXECUTED',
          approvedBy,
          approvedAt: new Date(),
          refundRequestId: refundRequest.id,
        },
      }),
    ]);

    return { approved: true, refundRequestId: refundRequest.id, amount: approval.amount };
  }

  /** FINANCE role: reject a pending high-value refund. */
  async rejectRefundRequest(approvalId: number, rejectedBy: number, rejectedReason: string) {
    const approval = await this.prisma.refundApproval.findUnique({ where: { id: approvalId } });
    if (!approval) throw new NotFoundException(`RefundApproval ${approvalId} not found`);
    if (approval.status !== 'PENDING') {
      throw new BadRequestException(`Approval ${approvalId} is already ${approval.status}`);
    }
    // T-AD01 FIX: rejector must also differ from requester
    if (approval.requestedBy === rejectedBy) {
      throw new ForbiddenException('Self-rejection is not permitted. A different user must action this request.');
    }

    return this.prisma.refundApproval.update({
      where: { id: approvalId },
      data: { status: 'REJECTED', rejectedBy, rejectedAt: new Date(), rejectedReason },
    });
  }

  /** List pending refund approvals (for FINANCE dashboard). */
  async getPendingRefundApprovals() {
    return this.prisma.refundApproval.findMany({
      where: { status: 'PENDING' },
      include: { order: { select: { id: true, total: true, userId: true } } },
      orderBy: { requestedAt: 'asc' },
    });
  }
}
