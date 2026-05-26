// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * Plugin lifecycle contract (plan §7 + §10 E4).
 *
 * Every ShopVerse plugin exports a default `ShopVersePlugin` object.
 * The kernel's manifest loader resolves it at boot and invokes each
 * lifecycle method in order: register → configure → ready → (running) →
 * shutdown.
 *
 * Error policy: if `onRegister` throws, the plugin is caught, logged,
 * and skipped. The kernel boot CONTINUES so a single bad plugin can't
 * down the fleet.
 */

import type { HookName, HookHandlerMap } from './hooks';
import type { EventName, EventConsumer } from './events';
import type { StrategyType, StrategyTypeMap } from './strategies';

// ─── Audit log entry (plan §10 E13) ────────────────────────────────────────

/**
 * Structured audit entry written via `kernel.audit.log()`. The kernel
 * persists this to `AdminAuditLog` with auto-tagged plugin id and
 * timestamp. Plugin authors MUST call this for any admin-equivalent
 * action they perform (lint rule warns on missing audit calls).
 */
export interface AuditLogEntry {
  /** Verb + resource, e.g. 'plugin.referral.code.redeem'. */
  readonly action: string;
  /** Target entity, e.g. `{ type: 'order', id: 42 }`. */
  readonly target: { readonly type: string; readonly id: string | number };
  /** Acting user, when the action is on behalf of a user. */
  readonly userId?: number | null;
  /** Free-form structured metadata. */
  readonly meta?: Readonly<Record<string, unknown>>;
}

// ─── Kernel surface exposed to plugins ──────────────────────────────────────

/**
 * The kernel API surface available inside plugin lifecycle methods.
 * Plugins receive this on `onRegister` to register hooks, events,
 * strategies, etc.
 *
 * All methods are typed against the SDK contracts — there is NO escape
 * hatch to raw `PrismaService` or other kernel internals.
 */
export interface KernelContext {
  /** Register a synchronous hook handler. */
  readonly hooks: {
    register<H extends HookName>(name: H, handler: HookHandlerMap[H]): void;
  };

  /** Subscribe to a kernel-emitted async event. */
  readonly events: {
    subscribe<E extends EventName>(name: E, consumer: EventConsumer<E>): void;
    /** Publish a plugin-namespaced event for plugin → plugin (E6). */
    publishCustom<T>(topic: string, payload: T): Promise<void>;
    /** Subscribe to a plugin-namespaced event. */
    subscribeCustom<T>(topic: string, consumer: (payload: T) => Promise<void>): void;
  };

  /** Register a strategy implementation. */
  readonly strategies: {
    register<T extends StrategyType>(
      type: T,
      impl: StrategyTypeMap[T],
    ): void;
  };

  /** Structured logger that auto-tags entries with `plugin.id`. */
  readonly logger: {
    log(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
    debug(message: string, meta?: Record<string, unknown>): void;
  };

  /**
   * Audit log (plan §10 E13). The kernel persists this to
   * `AdminAuditLog` and auto-attaches the plugin id + timestamp.
   * Use for any admin-equivalent action the plugin performs.
   */
  readonly audit: {
    log(entry: AuditLogEntry): Promise<void>;
  };

  /**
   * Cron registration (plan §10 E23 / §5 rule #9 — W1.T34).
   *
   * Plugins register one cron at most, with intervalMinutes >= 5.
   * Crons run on the WORKER process only — the API process skips
   * them. Failures are logged + recorded as Sentry events tagged
   * with the plugin id.
   */
  readonly crons: {
    register(spec: PluginCronSpec): void;
  };

  /**
   * BullMQ queue registration (plan §10 E24 — W1.T35).
   *
   * Plugins may register their own named queues; processors run on
   * the worker. The kernel automatically prefixes the queue name
   * with the plugin id (`<plugin>:<queue>`) to prevent collisions.
   */
  readonly queues: {
    register<T = unknown>(spec: PluginQueueSpec<T>): void;
  };

  /**
   * NestJS controller registration for plugin REST routes (plan §10
   * E25 — W1.T36). Routes appear in OpenAPI under the supplied tag.
   * Routes MUST start with `plugin/<id>/...` (lint-enforced by
   * W1.T8).
   */
  readonly api: {
    registerRoutes(
      controllerClass: new (...args: unknown[]) => unknown,
      options: PluginRouteOptions,
    ): void;
  };

  /**
   * Per-plugin config persistence (plan §10 E10 — W1.T27). Plugins use
   * this for operator-managed settings that survive restarts. The
   * plugin id is implied by the active plugin context (set by
   * HookRunner / PluginLoader via AsyncLocalStorage); calling outside
   * a plugin context throws.
   *
   * Values are JSON-serialised. Plugin authors own the schema for what
   * they put under each key — the SDK is a stringly-typed key/value
   * store, not a config-validation layer.
   */
  readonly config: {
    get<T = unknown>(key: string): Promise<T | null>;
    set<T = unknown>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
  };
}

// ─── Cron + queue + route specs ─────────────────────────────────────────────

export interface PluginCronSpec {
  /** Cron name — appears in metrics as `<plugin-id>:<name>`. */
  readonly name: string;
  /** Interval in minutes; minimum 5 (anti-storm rule). */
  readonly intervalMinutes: number;
  /** Cron body. Called inside a plugin context + CronLock automatically. */
  readonly handler: () => Promise<void>;
}

export interface PluginQueueSpec<T = unknown> {
  /** Queue name (auto-prefixed with plugin id). */
  readonly name: string;
  /** Worker concurrency (default 1, max 10). */
  readonly concurrency?: number;
  /** Job processor. */
  readonly processor: (job: { readonly data: T }) => Promise<void>;
}

export interface PluginRouteOptions {
  /** OpenAPI tag for the route group. */
  readonly tag: string;
}

// ─── Manifest entry (plan §10 E1) ──────────────────────────────────────────

export interface PluginManifestEntry {
  readonly id: string; // e.g. '@shopverse/plugin-referral'
  readonly source: 'npm' | 'workspace';
  readonly workspacePath?: string; // required when source === 'workspace'
  readonly enabled: boolean;
  /** Plugin-specific config; validated by the plugin if present. */
  readonly config?: Readonly<Record<string, unknown>>;
}

export interface PluginManifest {
  /** SemVer range; kernel boot validates against its own version. */
  readonly kernelVersion: string;
  readonly plugins: readonly PluginManifestEntry[];
}

// ─── Plugin lifecycle ───────────────────────────────────────────────────────

export interface ShopVersePlugin {
  /** Stable identifier; SHOULD match the npm package name when published. */
  readonly id: string;
  /** Plugin's own SemVer. */
  readonly version: string;
  /** SemVer range of compatible kernel versions. */
  readonly kernelVersion: string;

  /**
   * Called at kernel bootstrap, BEFORE first request served. Use this to
   * register hooks, events, strategies. If this throws, the plugin is
   * skipped and the kernel logs an ERROR but boot continues (E4).
   */
  onRegister(kernel: KernelContext): Promise<void> | void;

  /**
   * Called after `onRegister` succeeds, with the plugin's slice of the
   * runtime config (from `PluginManifestEntry.config`). Plugins SHOULD
   * validate their config here and throw on invalid input.
   */
  onConfigure?(
    kernel: KernelContext,
    config: Readonly<Record<string, unknown>> | undefined,
  ): Promise<void> | void;

  /**
   * Called after the kernel has finished bootstrapping all plugins and
   * is ready to serve traffic. Safe to start background work here.
   */
  onReady?(kernel: KernelContext): Promise<void> | void;

  /**
   * Called when the kernel receives SIGTERM. Plugin should release
   * resources (timers, external connections) within 5s.
   */
  onShutdown?(kernel: KernelContext): Promise<void> | void;
}

/** Helper: type-narrow check that a value is a valid plugin. */
export function isShopVersePlugin(value: unknown): value is ShopVersePlugin {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<ShopVersePlugin>;
  return (
    typeof v.id === 'string' &&
    typeof v.version === 'string' &&
    typeof v.kernelVersion === 'string' &&
    typeof v.onRegister === 'function'
  );
}
