// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, Logger } from '@nestjs/common';
import type { PluginCronSpec } from '@shopverse/sdk';

/**
 * PluginCronRegistry — plan §10 E23 (W1.T34).
 *
 * Collects plugin-registered crons. Validation:
 *
 *   - One cron per plugin (rule #9; checked at register time)
 *   - intervalMinutes >= 5 (rule #9 anti-storm)
 *   - Cron name uniqueness across plugins (prefixed `<plugin>:<name>`)
 *
 * Actual bootstrap happens on the WORKER process. The API process
 * still records the registration so `/admin/plugins` can list it,
 * but skips invocation. Worker startup reads `all()` and schedules
 * each cron under CronLockService (existing pattern).
 *
 * Today the registry holds the specs; the worker integration (W2+)
 * iterates them at boot. Single source of truth, two consumers.
 */

export interface RegisteredCron extends PluginCronSpec {
  readonly pluginId: string;
}

@Injectable()
export class PluginCronRegistry {
  private readonly logger = new Logger(PluginCronRegistry.name);
  private readonly byPlugin = new Map<string, RegisteredCron>();
  private readonly byPrefixedName = new Map<string, string>(); // prefixedName → pluginId

  register(pluginId: string, spec: PluginCronSpec): void {
    if (spec.intervalMinutes < 5) {
      throw new Error(
        `Plugin ${pluginId} cron "${spec.name}" intervalMinutes=${spec.intervalMinutes} ` +
          `violates rule #9 (minimum 5 minutes)`,
      );
    }
    if (this.byPlugin.has(pluginId)) {
      throw new Error(
        `Plugin ${pluginId} already registered cron "${this.byPlugin.get(pluginId)!.name}" ` +
          `— only one cron per plugin allowed (rule #9)`,
      );
    }
    const prefixedName = `${pluginId}:${spec.name}`;
    if (this.byPrefixedName.has(prefixedName)) {
      throw new Error(`Duplicate cron name: ${prefixedName}`);
    }
    this.byPlugin.set(pluginId, { ...spec, pluginId });
    this.byPrefixedName.set(prefixedName, pluginId);
    this.logger.log(
      `Registered cron ${prefixedName} (every ${spec.intervalMinutes} min)`,
    );
  }

  unregisterPlugin(pluginId: string): void {
    const reg = this.byPlugin.get(pluginId);
    if (!reg) return;
    this.byPlugin.delete(pluginId);
    this.byPrefixedName.delete(`${pluginId}:${reg.name}`);
  }

  all(): readonly RegisteredCron[] {
    return [...this.byPlugin.values()];
  }

  countForPlugin(pluginId: string): number {
    return this.byPlugin.has(pluginId) ? 1 : 0;
  }
}
