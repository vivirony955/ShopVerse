// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, Logger } from '@nestjs/common';
import type { AuditLogEntry } from '@shopverse/sdk';

/**
 * PluginAuditService — implements `kernel.audit.log()` (plan §10 E13).
 *
 * Records plugin-initiated admin actions. The kernel attaches the
 * acting plugin id and timestamp; plugins supply action verb, target,
 * optional userId, and structured metadata.
 *
 * Current persistence: structured log line (consumed by the
 * observability stack). The existing `AdminAuditLog` Prisma model
 * requires a non-null `adminId`, which doesn't fit plugin actions
 * (plugins may act on behalf of guests, system-triggered events, etc.).
 *
 * Persistence path forward: either
 *   (a) make `AdminAuditLog.adminId` nullable + add `pluginId String?`,
 *   (b) introduce a parallel `PluginAuditLog` model with a 1-to-many
 *       relation to User (when present).
 *
 * That's a small migration deferred from this task — the SDK contract
 * is the load-bearing piece because lint rules require plugins to call
 * it; persistence is observable today via the log stream and the
 * cron-extracted audit lake.
 *
 * Plugins MUST NOT log secrets here — the metadata field is included
 * in audit exports and dashboards. Pair with the PII scrubber if
 * uncertain.
 */
@Injectable()
export class PluginAuditService {
  private readonly logger = new Logger('PluginAudit');

  /**
   * Record an audit entry attributed to a plugin. Returns a Promise so
   * the SDK contract can later swap in DB persistence without changing
   * call sites.
   */
  log(pluginId: string, entry: AuditLogEntry): Promise<void> {
    const payload = {
      pluginId,
      action: entry.action,
      targetType: entry.target.type,
      targetId: entry.target.id,
      userId: entry.userId ?? null,
      meta: entry.meta ?? {},
      timestamp: new Date().toISOString(),
    };
    this.logger.log(`audit ${entry.action}`, payload as never);
    return Promise.resolve();
  }
}
