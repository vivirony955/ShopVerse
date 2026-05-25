// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, Logger } from '@nestjs/common';
import type { PluginQueueSpec } from '@shopverse/sdk';

/**
 * PluginQueueRegistry — plan §10 E24 (W1.T35).
 *
 * Collects plugin-registered BullMQ queues. Validation:
 *
 *   - Queue name is non-empty, unique per plugin
 *   - concurrency in [1, 10]; defaults to 1
 *
 * Storage shape carries the processor function for later worker
 * bootstrap. The API process records the registration so a future
 * `/admin/plugins/:id/queues` can list them, but does NOT start a
 * worker. Only the dedicated worker process (DISABLE_WORKERS=false)
 * iterates the registry and starts BullMQ Workers.
 */

const MAX_CONCURRENCY = 10;

export interface RegisteredQueue<T = unknown> {
  readonly pluginId: string;
  readonly name: string;
  /** Auto-prefixed: `<plugin-id>:<name>`. */
  readonly prefixedName: string;
  readonly concurrency: number;
  readonly processor: (job: { readonly data: T }) => Promise<void>;
}

@Injectable()
export class PluginQueueRegistry {
  private readonly logger = new Logger(PluginQueueRegistry.name);
  private readonly byPrefixedName = new Map<string, RegisteredQueue>();
  private readonly byPlugin = new Map<string, Set<string>>(); // pluginId → prefixedNames

  register<T>(pluginId: string, spec: PluginQueueSpec<T>): void {
    if (!spec.name || spec.name.trim().length === 0) {
      throw new Error(`Plugin ${pluginId} queue name must be non-empty`);
    }
    const concurrency = spec.concurrency ?? 1;
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_CONCURRENCY) {
      throw new Error(
        `Plugin ${pluginId} queue "${spec.name}" concurrency=${concurrency} ` +
          `must be an integer in [1, ${MAX_CONCURRENCY}]`,
      );
    }

    const prefixedName = `${pluginId}:${spec.name}`;
    if (this.byPrefixedName.has(prefixedName)) {
      throw new Error(`Duplicate queue: ${prefixedName}`);
    }

    const queue: RegisteredQueue<T> = {
      pluginId,
      name: spec.name,
      prefixedName,
      concurrency,
      processor: spec.processor,
    };
    this.byPrefixedName.set(prefixedName, queue as RegisteredQueue);
    const pluginQueues = this.byPlugin.get(pluginId) ?? new Set();
    pluginQueues.add(prefixedName);
    this.byPlugin.set(pluginId, pluginQueues);

    this.logger.log(
      `Registered queue ${prefixedName} (concurrency=${concurrency})`,
    );
  }

  unregisterPlugin(pluginId: string): void {
    const names = this.byPlugin.get(pluginId);
    if (!names) return;
    for (const name of names) this.byPrefixedName.delete(name);
    this.byPlugin.delete(pluginId);
  }

  all(): readonly RegisteredQueue[] {
    return [...this.byPrefixedName.values()];
  }

  forPlugin(pluginId: string): readonly RegisteredQueue[] {
    const names = this.byPlugin.get(pluginId);
    if (!names) return [];
    const out: RegisteredQueue[] = [];
    for (const n of names) {
      const q = this.byPrefixedName.get(n);
      if (q) out.push(q);
    }
    return out;
  }
}
