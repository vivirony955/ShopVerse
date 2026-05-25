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
