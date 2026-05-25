// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Role, Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from './types';
import { PluginRuntimeStateService } from './plugin-runtime-state.service';
import { PluginLoader, type PluginLoadResult } from './plugin-loader.service';

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
  ) {}

  @Get()
  @ApiOperation({ summary: 'List loaded plugins + runtime status' })
  list(): readonly PluginAdminEntry[] {
    return this.loader.all().map((r) => this.toEntry(r));
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
      loadStatus: r.status,
      operatorDisabled: this.runtime.isDisabled(r.id),
      error: r.error,
    };
  }
}

export interface PluginAdminEntry {
  readonly id: string;
  readonly loadStatus: PluginLoadResult['status'];
  readonly operatorDisabled: boolean;
  readonly error?: string;
}
