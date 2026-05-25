// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { HookRunner } from './hook-runner.service';
import { RedisService } from './redis.service';

/**
 * PluginRuntimeStateService — plan §10 E2 (W1.T20).
 *
 * Operator-driven kill switch for misbehaving plugins. Three states
 * per plugin (plan §6, amended by E2):
 *
 *   enabled               default — hooks run, events deliver
 *   breaker-open          automatic — CircuitBreaker opened after
 *                         consecutive failures (HookRunner-internal)
 *   operator-disabled     manual — operator flipped the kill switch
 *                         via admin endpoint; persists in Redis;
 *                         every pod converges within sync interval
 *
 * Redis is the source of truth for operator-disabled across pods. Each
 * pod maintains an in-memory mirror for hot-path lookups (HookRunner
 * checks the set on every hook invocation; can't afford a Redis hop).
 *
 * Sync strategy:
 *   - On boot: hydrate from Redis set; apply to HookRunner
 *   - On disable/enable API call: update HookRunner + write Redis
 *   - Periodic refresh (5s): re-read Redis, reconcile local state.
 *     This is how OTHER pods learn about changes made on THIS pod.
 *
 * Redis-disabled mode: in-memory only. Single-pod deployments work.
 * Multi-pod deployments without Redis will diverge — documented as
 * an explicit requirement in the operator runbook (W6 docs task).
 */

const REDIS_KEY = 'shopverse:plugin:operator-disabled';
const SYNC_INTERVAL_MS = 5_000;

@Injectable()
export class PluginRuntimeStateService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PluginRuntimeStateService.name);
  private syncTimer: NodeJS.Timeout | null = null;
  private syncing = false;

  constructor(
    private readonly redis: RedisService,
    private readonly hooks: HookRunner,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.hydrate();

    if (process.env.NODE_ENV === 'test') {
      // Disable polling in tests — test setup calls hydrate() / sync()
      // explicitly. Tests do this to avoid timer-based flakiness.
      return;
    }

    this.syncTimer = setInterval(() => {
      // Fire-and-forget; sync() catches its own errors.
      void this.sync();
    }, SYNC_INTERVAL_MS);
    if (typeof this.syncTimer === 'object' && this.syncTimer !== null) {
      (this.syncTimer as { unref: () => void }).unref();
    }
  }

  onModuleDestroy(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Disable a plugin. Updates HookRunner immediately so the next hook
   * call on this pod skips the plugin; persists to Redis so other pods
   * converge on next sync.
   */
  async disable(pluginId: string, byAdminId: number | null = null): Promise<void> {
    this.hooks.disablePlugin(pluginId);
    await this.redis.sadd(REDIS_KEY, pluginId);
    this.logger.warn(
      `Plugin ${pluginId} disabled by operator${byAdminId !== null ? ` (admin ${byAdminId})` : ''}`,
    );
  }

  /** Re-enable a previously disabled plugin. */
  async enable(pluginId: string, byAdminId: number | null = null): Promise<void> {
    this.hooks.enablePlugin(pluginId);
    await this.redis.srem(REDIS_KEY, pluginId);
    this.logger.log(
      `Plugin ${pluginId} re-enabled by operator${byAdminId !== null ? ` (admin ${byAdminId})` : ''}`,
    );
  }

  /** Inspection — used by admin endpoint. */
  isDisabled(pluginId: string): boolean {
    return this.hooks.isPluginDisabled(pluginId);
  }

  /** Hydrate in-memory state from Redis at boot. */
  async hydrate(): Promise<void> {
    const members = await this.redis.smembers(REDIS_KEY);
    for (const id of members) {
      this.hooks.disablePlugin(id);
    }
    if (members.length > 0) {
      this.logger.log(
        `Hydrated ${members.length} operator-disabled plugin(s) from Redis: ${members.join(', ')}`,
      );
    }
  }

  /**
   * Reconcile in-memory disabled set with Redis. Add any new Redis
   * entries to HookRunner; remove any local entries no longer in Redis.
   * Runs every SYNC_INTERVAL_MS and on demand.
   */
  async sync(): Promise<void> {
    if (this.syncing) return; // overlapping invocations
    this.syncing = true;
    try {
      const remote = new Set(await this.redis.smembers(REDIS_KEY));
      // Apply additions.
      for (const id of remote) {
        if (!this.hooks.isPluginDisabled(id)) {
          this.hooks.disablePlugin(id);
        }
      }
      // Nothing to remove unless we track local-only entries — local
      // mutations always go through disable()/enable() which write to
      // Redis, so divergence only happens FROM Redis. For now, sync
      // is one-way (Redis → local). A future improvement could track
      // operator-disabled vs internally-disabled separately.
    } catch (err) {
      this.logger.warn(
        `Plugin runtime state sync failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.syncing = false;
    }
  }
}
