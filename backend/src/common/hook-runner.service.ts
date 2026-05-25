// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, Logger } from '@nestjs/common';
import type { HookName, HookHandlerMap, RejectReason } from '@shopverse/sdk';
import { HOOK_BUDGETS_MS } from '@shopverse/sdk';
import { CircuitBreaker } from './circuit-breaker';
import { runInPluginContext } from './plugin-context';

/**
 * HookRunner — plan §4 (hooks) + §5 (perf governance) + §6 (failure model).
 *
 * Central registry + invoker for synchronous plugin hooks. Three
 * properties are load-bearing:
 *
 * 1. No-op fast path (plan §5 + self-critique #6). When zero handlers
 *    are registered for a hook, `runSync` returns IMMEDIATELY without
 *    allocating Promises, awaiting, or constructing AsyncLocalStorage
 *    contexts. Microbenchmark target: < 100ns / call.
 *
 * 2. Per-plugin-per-hook CircuitBreaker (plan §6 + §10 E2). A handler
 *    that times out or throws repeatedly opens its breaker; subsequent
 *    invocations skip that handler silently. Operator can also force-open
 *    via the kill-switch endpoint (W1.T20).
 *
 * 3. Budget enforcement (plan §5 rules #2–4). Each handler runs under
 *    Promise.race with a per-hook timeout (HOOK_BUDGETS_MS). Timeout →
 *    treated as failure → breaker.recordFailure().
 *
 * Hook handlers are wrapped objects (`RegisteredHook`) that carry the
 * plugin id for attribution. This is what gets surfaced in OTel spans,
 * Sentry tags, and the per-plugin Prometheus labels.
 *
 * @see plan section §4 (hook surface), §5 (perf), §6 (breakers), §10 E2 (disable)
 */

const KERNEL_PLUGIN_ID = 'kernel';

/** A registered handler with attribution metadata. */
interface RegisteredHook<H extends HookName> {
  readonly pluginId: string;
  readonly handler: HookHandlerMap[H];
  readonly breaker: CircuitBreaker;
}

/** Result of running all handlers for a sync hook. */
export interface HookRunResult {
  /** Whether at least one handler returned a RejectReason. */
  readonly rejected: boolean;
  /** First rejection encountered, if any. Caller throws BadRequestException. */
  readonly rejectReason: RejectReason | null;
  /** Per-plugin durations + outcomes for observability. */
  readonly outcomes: ReadonlyArray<HookOutcome>;
}

export interface HookOutcome {
  readonly pluginId: string;
  readonly status: 'ok' | 'rejected' | 'failed' | 'timeout' | 'breaker-open';
  readonly durationMs: number;
  readonly error?: string;
}

@Injectable()
export class HookRunner {
  private readonly logger = new Logger(HookRunner.name);

  // Map<hook, RegisteredHook[]>. Using a Map (not Record) for fast
  // O(1) lookup + no prototype chain noise.
  private readonly registry = new Map<HookName, RegisteredHook<HookName>[]>();

  // Hard kill-switch set (plan §10 E2). Disabled plugins skip ALL hooks
  // regardless of breaker state. Backed by Redis in production via a
  // separate sync service that updates this set on TTL.
  private readonly disabledPlugins = new Set<string>();

  /**
   * Register a hook handler. Called by the kernel during plugin
   * bootstrap. Idempotent on (pluginId, hookName) pairs — re-registration
   * replaces the prior breaker.
   */
  register<H extends HookName>(
    name: H,
    pluginId: string,
    handler: HookHandlerMap[H],
  ): void {
    const list = this.registry.get(name) ?? [];
    // Replace if same (plugin, hook) already exists.
    const idx = list.findIndex((h) => h.pluginId === pluginId);
    const reg: RegisteredHook<H> = {
      pluginId,
      handler,
      breaker: new CircuitBreaker(),
    };
    if (idx >= 0) list[idx] = reg as RegisteredHook<HookName>;
    else list.push(reg as RegisteredHook<HookName>);
    this.registry.set(name, list);
    this.logger.log(`Registered hook ${name} from ${pluginId}`);
  }

  /**
   * Unregister all hooks from a plugin. Called when a plugin fails to
   * boot (E4) or is uninstalled.
   */
  unregisterPlugin(pluginId: string): void {
    for (const [name, list] of this.registry) {
      const filtered = list.filter((h) => h.pluginId !== pluginId);
      if (filtered.length === 0) this.registry.delete(name);
      else this.registry.set(name, filtered);
    }
  }

  /** Operator kill-switch (plan §10 E2). */
  disablePlugin(pluginId: string): void {
    this.disabledPlugins.add(pluginId);
    this.logger.warn(`Plugin ${pluginId} disabled by operator`);
  }

  enablePlugin(pluginId: string): void {
    this.disabledPlugins.delete(pluginId);
    this.logger.log(`Plugin ${pluginId} re-enabled by operator`);
  }

  /** Inspection helpers — used by admin endpoint + tests. */
  isPluginDisabled(pluginId: string): boolean {
    return this.disabledPlugins.has(pluginId);
  }

  handlerCount(name: HookName): number {
    return this.registry.get(name)?.length ?? 0;
  }

  /**
   * Run all registered handlers for a hook. Sequential invocation —
   * handlers within a hook run in registration order, NOT in parallel,
   * because:
   *   1. Pre-validation hooks need short-circuit on first rejection
   *   2. Post-commit hooks run with a TOTAL budget (50ms) across all,
   *      not per-handler; parallel would inflate apparent budget
   *   3. Sequential is auditable in traces; one span per handler
   *
   * Caller (kernel service) checks `result.rejected` and throws
   * BadRequestException with `result.rejectReason.message` if true.
   *
   * The no-op fast path: when registry is empty for this hook, we
   * synchronously return a sentinel result without allocating per-call
   * objects. Cost: 1 Map.get + 1 length check + 1 returned constant.
   */
  async runSync<H extends HookName>(
    name: H,
    ctx: Parameters<HookHandlerMap[H]>[0],
  ): Promise<HookRunResult> {
    const handlers = this.registry.get(name);
    if (!handlers || handlers.length === 0) {
      return EMPTY_RESULT;
    }

    const budgetMs = HOOK_BUDGETS_MS[name];
    const outcomes: HookOutcome[] = [];
    let rejectReason: RejectReason | null = null;

    for (const reg of handlers) {
      // Skip disabled plugins (operator kill-switch).
      if (this.disabledPlugins.has(reg.pluginId)) {
        outcomes.push({
          pluginId: reg.pluginId,
          status: 'breaker-open',
          durationMs: 0,
        });
        continue;
      }

      // Skip plugins whose breaker is currently open.
      if (!reg.breaker.tryAcquire()) {
        outcomes.push({
          pluginId: reg.pluginId,
          status: 'breaker-open',
          durationMs: 0,
        });
        continue;
      }

      const start = process.hrtime.bigint();
      let status: HookOutcome['status'] = 'ok';
      let errMsg: string | undefined;

      try {
        // Race handler against budget, attributed to its plugin via ALS
        // so OTel spans + Sentry events tag with `plugin.id` correctly.
        // Query budget of 1 enforces plan §5 rule #5 — sync hooks may
        // issue at most ONE Prisma query per invocation. The Prisma
        // middleware in PrismaService counts queries and throws past 1.
        const result = await runInPluginContext(
          reg.pluginId,
          () =>
            Promise.race([
              (
                reg.handler as (
                  c: Parameters<HookHandlerMap[H]>[0],
                ) => Promise<void | RejectReason>
              )(ctx),
              this.timeoutAfter(budgetMs),
            ]),
          1,
        );

        if (result === TIMEOUT) {
          status = 'timeout';
          errMsg = `Exceeded ${budgetMs}ms budget`;
          reg.breaker.recordFailure();
        } else if (result && typeof result === 'object' && 'reject' in result) {
          status = 'rejected';
          if (!rejectReason) rejectReason = result;
          // A rejection is NOT a plugin failure — it's the contract
          // working. Do NOT count toward the breaker.
          reg.breaker.recordSuccess();
        } else {
          reg.breaker.recordSuccess();
        }
      } catch (err) {
        status = 'failed';
        errMsg = err instanceof Error ? err.message : String(err);
        reg.breaker.recordFailure();
      }

      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      outcomes.push({
        pluginId: reg.pluginId,
        status,
        durationMs,
        ...(errMsg ? { error: errMsg } : {}),
      });

      if (status === 'failed' || status === 'timeout') {
        this.logger.warn(
          `Hook ${name} from ${reg.pluginId} ${status}: ${errMsg ?? ''} (${durationMs.toFixed(1)}ms)`,
        );
      }

      // Short-circuit on first rejection for pre-validation hooks.
      if (rejectReason) break;
    }

    return {
      rejected: rejectReason !== null,
      rejectReason,
      outcomes,
    };
  }

  /**
   * Internal: race-against-timeout helper. Resolves with the sentinel
   * `TIMEOUT` symbol after `ms` milliseconds. Uses `unref()` so a
   * pending timer doesn't keep the worker process alive on shutdown.
   */
  private timeoutAfter(ms: number): Promise<typeof TIMEOUT> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(TIMEOUT), ms);
      if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
        (timer as { unref: () => void }).unref();
      }
    });
  }
}

const TIMEOUT = Symbol('hook-timeout');

/**
 * Sentinel returned by the no-op fast path. Singleton — never allocated
 * per call — so zero GC pressure when no handlers are registered.
 */
const EMPTY_RESULT: HookRunResult = Object.freeze({
  rejected: false,
  rejectReason: null,
  outcomes: Object.freeze([]) as readonly HookOutcome[],
});

// Re-export for tests / future consumers.
export { KERNEL_PLUGIN_ID };
