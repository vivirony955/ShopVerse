import { Controller, Get, Post, Patch, Body, Query, Param, ParseIntPipe, DefaultValuePipe, UseGuards, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { AdminService } from './admin.service';
import { ErrorTrackingService } from '../common/error-tracking.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Role, Roles } from '../auth/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly errorTracking: ErrorTrackingService,
  ) {}

  @Get('dashboard')
  getDashboard() { return this.adminService.getDashboardStats(); }

  @Get('low-stock')
  getLowStock(@Query('threshold', new DefaultValuePipe(5), ParseIntPipe) threshold: number) {
    return this.adminService.getLowStockVariants(threshold);
  }

  @Get('out-of-stock')
  getOutOfStock() { return this.adminService.getOutOfStockVariants(); }

  @Get('revenue-report')
  getRevenueReport(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
    return this.adminService.getRevenueReport(days);
  }

  // F1-21: CSV export of revenue report
  @Get('export/revenue.csv')
  async exportRevenueCsv(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @Res() res: Response,
  ) {
    const report = await this.adminService.getRevenueReport(days);
    const rows: string[] = [];
    if (Array.isArray(report)) {
      if (report.length > 0) rows.push(Object.keys(report[0]).join(','));
      for (const row of report) {
        rows.push(Object.values(row).map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
      }
    } else {
      // report is an object — flatten keys
      rows.push('metric,value');
      for (const [k, v] of Object.entries(report as Record<string, unknown>)) {
        rows.push(`"${k}","${String(v ?? '')}"`);
      }
    }
    const csv = rows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="revenue-report-${days}d.csv"`);
    res.send(csv);
  }

  @Get('finance-dashboard')
  getFinanceDashboard() { return this.adminService.getFinanceDashboard(); }

  @Get('ops-dashboard')
  getOpsDashboard() { return this.adminService.getOpsDashboard(); }

  @Get('live-metrics')
  getLiveMetrics() { return this.adminService.getLiveMetrics(); }

  @Get('customer-analytics')
  getCustomerAnalytics() { return this.adminService.getCustomerAnalytics(); }

  @Get('funnel')
  getFunnel(@Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number) {
    return this.adminService.getFunnelAnalytics(days);
  }

  @Get('orders')
  getAllOrders(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit?: number,
  ) {
    return this.adminService.getAllOrders({ status, page, limit, requestedBy: req.user.id });
  }

  @Patch('orders/:id/status')
  updateOrderStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: string,
  ) {
    // Delegate to orders service via prisma directly
    return this.adminService.updateOrderStatus(id, status);
  }

  @Get('users')
  getAllUsers(
    @Req() req: any,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit?: number,
  ) {
    return this.adminService.getAllUsers({ search, page, limit, requestedBy: req.user.id });
  }

  @Get('audit-logs')
  getAuditLogs(
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('entity') entity?: string,
    @Query('adminId', new DefaultValuePipe(0), ParseIntPipe) adminId?: number,
  ) {
    return this.adminService.getAuditLogs(limit, entity, adminId || undefined);
  }

  // ─── Error tracking ────────────────────────────────────────────────────────

  @Get('errors')
  getErrors(
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('level') level?: string,
  ) {
    return this.errorTracking.getRecentErrors(limit, level);
  }

  @Get('errors/stats')
  getErrorStats(@Query('window', new DefaultValuePipe(60), ParseIntPipe) window: number) {
    return this.errorTracking.getErrorStats(window);
  }

  @Patch('errors/:id/resolve')
  resolveError(@Param('id', ParseIntPipe) id: number) {
    return this.errorTracking.resolveError(id);
  }

  // ─── Maker-Checker: High-Value Refund Approval ────────────────────────────

  /** CS_AGENT: request a high-value refund (> ₹5000) for FINANCE approval. */
  @Post('refund-approvals')
  @Roles(Role.ADMIN, Role.CS_AGENT, Role.SUPER_ADMIN)
  requestHighValueRefund(
    @Body() body: { orderId: number; amount: number; reason: string },
    @Req() req: any,
  ) {
    return this.adminService.requestHighValueRefund(body.orderId, body.amount, body.reason, req.user.id);
  }

  /** FINANCE: list pending refund approvals. */
  @Get('refund-approvals/pending')
  @Roles(Role.ADMIN, Role.FINANCE, Role.SUPER_ADMIN)
  getPendingRefundApprovals() {
    return this.adminService.getPendingRefundApprovals();
  }

  /** FINANCE: approve a high-value refund. */
  @Patch('refund-approvals/:id/approve')
  @Roles(Role.ADMIN, Role.FINANCE, Role.SUPER_ADMIN)
  approveRefundRequest(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.adminService.approveRefundRequest(id, req.user.id);
  }

  /** FINANCE: reject a high-value refund. */
  @Patch('refund-approvals/:id/reject')
  @Roles(Role.ADMIN, Role.FINANCE, Role.SUPER_ADMIN)
  rejectRefundRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    return this.adminService.rejectRefundRequest(id, req.user.id, reason);
  }
}
