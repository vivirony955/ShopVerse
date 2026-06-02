// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Injectable, Logger } from '@nestjs/common';
import type {
  KernelContext,
  PluginManifest,
  PluginManifestEntry,
  ShopVersePlugin,
} from '@shopverse/sdk';
import {
  assertValidManifest,
  checkKernelVersion,
  isShopVersePlugin,
} from '@shopverse/sdk';
import { runInPluginContext, setPluginSentryRate } from './plugin-context';

/**
 * PluginLoader — plan §10 E1, E3, E4.
 *
 * Reads a `PluginManifest` (already validated), resolves each entry to a
 * `ShopVersePlugin` instance, validates kernelVersion compatibility, and
 * invokes the lifecycle hooks under per-plugin isolation:
 *
 *   - If `onRegister` THROWS, that plugin is caught + logged + skipped.
 *     Boot continues. Other plugins are unaffected.
 *   - If kernelVersion peer dep mismatches, the plugin is SKIPPED (not
 *     a hard failure) — a single bad version pin shouldn't ground the
 *     fleet. ERROR-level log surfaces it in observability.
 *   - If `enabled: false`, the plugin is loaded into the registry (so
 *     `/admin/plugins` lists it) but `onRegister` is NOT called.
 *
 * The loader is intentionally NOT NestJS-DI-aware for the plugin objects
 * themselves — plugins are plain objects with closures, not Nest
 * providers. This keeps the boundary clean: a plugin gets the
 * `KernelContext` it's handed at `onRegister`, nothing more.
 */

export interface PluginLoadResult {
  readonly id: string;
  readonly status:
    | 'registered' // onRegister ran successfully
    | 'disabled' // enabled:false in manifest
    | 'version-mismatch'
    | 'register-failed' // onRegister threw
    | 'invalid';
  readonly error?: string;
}

/** Resolver maps a `PluginManifestEntry` to a `ShopVersePlugin` instance. */
// Return is `unknown` since it may be a module, the plugin object directly,
// or a Promise of either — `pickPluginExport()` normalises whatever shape
// the awaited value has.
export type PluginResolver = (entry: PluginManifestEntry) => unknown;

@Injectable()
export class PluginLoader {
  private readonly logger = new Logger(PluginLoader.name);
  private readonly results = new Map<string, PluginLoadResult>();

  /**
   * Load every entry in the manifest in declared order. Returns the
   * per-plugin result map. Caller is responsible for surfacing errors
   * (admin UI, alerting). Boot CONTINUES regardless of per-plugin
   * failures.
   */
  async loadAll(
    manifest: PluginManifest,
    currentKernelVersion: string,
    kernel: KernelContext,
    resolver: PluginResolver,
  ): Promise<readonly PluginLoadResult[]> {
    assertValidManifest(manifest);
    this.results.clear();

    for (const entry of manifest.plugins) {
      const result = await this.loadOne(
        entry,
        currentKernelVersion,
        kernel,
        resolver,
      );
      this.results.set(entry.id, result);
    }

    return [...this.results.values()];
  }

  /** Inspection: result for a single plugin (used by admin endpoint). */
  resultFor(id: string): PluginLoadResult | undefined {
    return this.results.get(id);
  }

  /** Inspection: all results. */
  all(): readonly PluginLoadResult[] {
    return [...this.results.values()];
  }

  /**
   * Seed a result entry directly without invoking `onRegister`. Used by
   * `PluginBootstrapService` to populate the registry from the manifest
   * at boot — the plugin modules themselves are already wired into
   * NestJS DI by `resolvePluginModules()` (see app.module.ts), so the
   * loader's `loadAll()` path (which is for SDK-style ShopVersePlugin
   * objects) doesn't run on first-party NestJS-module plugins. Without
   * this seed, `/admin/plugins` returns [] in production — the bug
   * surfaced by the local Playwright run + the W6.T3 integration test
   * skips.
   */
  seedManifestResult(id: string, status: PluginLoadResult['status']): void {
    this.results.set(id, { id, status });
  }

  private async loadOne(
    entry: PluginManifestEntry,
    currentKernelVersion: string,
    kernel: KernelContext,
    resolver: PluginResolver,
  ): Promise<PluginLoadResult> {
    if (!entry.enabled) {
      this.logger.log(
        `Plugin ${entry.id} disabled in manifest — skipping onRegister`,
      );
      return { id: entry.id, status: 'disabled' };
    }

    let mod: unknown;
    try {
      mod = await resolver(entry);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Plugin ${entry.id} failed to resolve: ${msg}`);
      return { id: entry.id, status: 'invalid', error: msg };
    }

    const plugin = pickPluginExport(mod);
    if (!plugin) {
      this.logger.error(
        `Plugin ${entry.id} module does not export a valid ShopVersePlugin`,
      );
      return {
        id: entry.id,
        status: 'invalid',
        error: 'Module does not export a valid ShopVersePlugin',
      };
    }

    if (plugin.id !== entry.id) {
      this.logger.error(
        `Plugin id mismatch: manifest declares "${entry.id}" but module exports "${plugin.id}"`,
      );
      return {
        id: entry.id,
        status: 'invalid',
        error: `Module id "${plugin.id}" does not match manifest id "${entry.id}"`,
      };
    }

    if (!checkKernelVersion(plugin.kernelVersion, currentKernelVersion)) {
      this.logger.error(
        `Plugin ${entry.id} requires kernel ${plugin.kernelVersion} but ` +
          `current kernel is ${currentKernelVersion} — skipping`,
      );
      return {
        id: entry.id,
        status: 'version-mismatch',
        error: `Requires kernel ${plugin.kernelVersion}; have ${currentKernelVersion}`,
      };
    }

    // E15 — apply manifest-declared Sentry sample rate before any plugin
    // code runs, so even an onRegister-thrown error is sampled correctly.
    const sentryCfg = entry.config?.sentry as
      | { sampleRate?: number }
      | undefined;
    if (typeof sentryCfg?.sampleRate === 'number') {
      setPluginSentryRate(entry.id, sentryCfg.sampleRate);
    }

    try {
      await runInPluginContext(entry.id, () => plugin.onRegister(kernel));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Plugin ${entry.id} onRegister threw: ${msg}`);
      return { id: entry.id, status: 'register-failed', error: msg };
    }

    this.logger.log(`Plugin ${entry.id}@${plugin.version} registered`);
    return { id: entry.id, status: 'registered' };
  }
}

/**
 * The resolver may return either the plugin object directly, a module
 * with `default`, or a module with a named export. Try each in order.
 */
function pickPluginExport(mod: unknown): ShopVersePlugin | null {
  if (isShopVersePlugin(mod)) return mod;
  if (typeof mod === 'object' && mod !== null) {
    const m = mod as Record<string, unknown>;
    if (isShopVersePlugin(m.default)) return m.default;
    if (isShopVersePlugin(m.plugin)) return m.plugin;
  }
  return null;
}
