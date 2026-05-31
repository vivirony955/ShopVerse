// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Controller, Get, Post, Param, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Role, Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from './types';
import { PluginRuntimeStateService } from './plugin-runtime-state.service';
import { PluginLoader, type PluginLoadResult } from './plugin-loader.service';
import { HookRunner } from './hook-runner.service';
import { PluginMetricsService } from './plugin-metrics.service';
import type { CircuitBreakerState } from './circuit-breaker';

/**
 * PluginAdminController — plan §10 E2 admin surface (W1.T20).
 *
 * Exposes operator controls for the plugin runtime:
 *
 *   GET  /admin/plugins                  list all plugins + status
 *   GET  /admin/plugins/:id              status of one plugin
 *   POST /admin/plugins/:id/disable      operator kill switch
 *   POST /admin/plugins/:id/enable       re-enable a disabled plugin
 *
 * These endpoints are auditable via AdminAuditInterceptor (already
 * applied to all admin routes globally via APP_INTERCEPTOR). Requests
 * are gated by JwtAuthGuard + RolesGuard at ADMIN.
 */

@ApiTags('Admin: Plugins')
@ApiBearerAuth('JWT')
@Controller('admin/plugins')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class PluginAdminController {
  constructor(
    private readonly loader: PluginLoader,
    private readonly runtime: PluginRuntimeStateService,
    private readonly hookRunner: HookRunner,
    private readonly metrics: PluginMetricsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List loaded plugins + runtime status' })
  list(): readonly PluginAdminEntry[] {
    return this.loader.all().map((r) => this.toEntry(r));
  }

  /**
   * Task 6 / POST_W6 §4.4 — runtime metrics endpoint.
   *
   * Aggregate breaker state + p95 latency per loaded plugin. Backed by
   * an in-process map (single-tenant v1; no scatter-gather). Empty fields
   * for plugins that have never fired a hook return null, NOT zero —
   * the frontend renders these as "—" to distinguish "no data" from
   * "instant response."
   *
   * Route placement note: this MUST come before any `:id` parameterized
   * route below, otherwise NestJS will route `/admin/plugins/runtime-metrics`
   * to `status(':id'='runtime-metrics')` and 404.
   */
  @Get('runtime-metrics')
  @ApiOperation({ summary: 'Per-plugin breaker + p95 runtime metrics' })
  runtimeMetrics(): Record<string, PluginRuntimeMetricsEntry> {
    const result: Record<string, PluginRuntimeMetricsEntry> = {};
    for (const r of this.loader.all()) {
      const stats = this.metrics.getRuntimeStats(r.id);
      result[r.id] = {
        breakerState: this.hookRunner.breakerStateFor(r.id),
        hookP95Ms: stats.hookP95Ms,
        eventP95Ms: stats.eventP95Ms,
        lastFailureMs: stats.lastFailureMs,
      };
    }
    return result;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Status of one plugin' })
  status(@Param('id') id: string): PluginAdminEntry | null {
    const r = this.loader.resultFor(id);
    return r ? this.toEntry(r) : null;
  }

  @Post(':id/disable')
  @ApiOperation({ summary: 'Operator kill switch — disable a plugin' })
  async disable(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ disabled: true; id: string }> {
    await this.runtime.disable(id, req.user?.id ?? null);
    return { disabled: true, id };
  }

  @Post(':id/enable')
  @ApiOperation({ summary: 'Re-enable a previously disabled plugin' })
  async enable(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ enabled: true; id: string }> {
    await this.runtime.enable(id, req.user?.id ?? null);
    return { enabled: true, id };
  }

  private toEntry(r: PluginLoadResult): PluginAdminEntry {
    return {
      id: r.id,
      // Map the loader's 5 statuses to the 4 the frontend's
      // PluginAdminEntry type understands. The loader records what
      // HAPPENED ('registered' = onRegister ran, 'invalid' = couldn't
      // resolve, 'register-failed' = threw); the admin UI cares
      // whether the plugin is up + healthy ('loaded') or broken
      // ('failed'). 'disabled' and 'version-mismatch' pass through.
      loadStatus: mapLoadStatus(r.status),
      operatorDisabled: this.runtime.isDisabled(r.id),
      error: r.error,
    };
  }
}

function mapLoadStatus(
  status: PluginLoadResult['status'],
): 'loaded' | 'disabled' | 'version-mismatch' | 'failed' {
  switch (status) {
    case 'registered':
      return 'loaded';
    case 'disabled':
      return 'disabled';
    case 'version-mismatch':
      return 'version-mismatch';
    case 'register-failed':
    case 'invalid':
      return 'failed';
  }
}

export interface PluginAdminEntry {
  readonly id: string;
  readonly loadStatus: 'loaded' | 'disabled' | 'version-mismatch' | 'failed';
  readonly operatorDisabled: boolean;
  readonly error?: string;
}

export interface PluginRuntimeMetricsEntry {
  /** Worst breaker state across the plugin's registered hooks; null
   * when the plugin has no hooks. */
  readonly breakerState: CircuitBreakerState | null;
  /** p95 hook handler duration (ms) over the last 5 minutes; null
   * when the plugin has never fired a hook. */
  readonly hookP95Ms: number | null;
  /** p95 event consumer duration; null in v1 — EventBus integration
   * is a follow-on (additive, no API break). */
  readonly eventP95Ms: number | null;
  /** Timestamp (ms since epoch) of the most recent failure within the
   * window; null when no failure in window. */
  readonly lastFailureMs: number | null;
}
