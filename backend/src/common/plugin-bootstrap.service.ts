// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { PluginManifest } from '@shopverse/sdk';
import pluginsConfig from '../../plugins.config';
import { PluginLoader } from './plugin-loader.service';

/**
 * PluginBootstrapService — closes the W6.T3 loader-bootstrap gap that
 * the W7 admin/plugins e2e + W6 integration tests both surfaced.
 *
 * Why this exists
 * ──────────────
 * Two plugin-loading mechanisms coexist in the kernel:
 *
 * 1. NestJS DynamicModule path (the real one). At AppModule
 *    decoration time `resolvePluginModules(pluginsConfig)` walks the
 *    manifest and spreads each plugin's NestJS module into
 *    `imports: []`. NestJS then instantiates `OnApplicationBootstrap`
 *    providers inside each plugin module (e.g. HelloWorldBootstrap),
 *    which is what actually calls `hooks.register(...)` and
 *    `eventBus.subscribe(...)`.
 *
 * 2. SDK ShopVersePlugin path (the designed-for-future one). The
 *    `PluginLoader.loadAll()` method takes a manifest + a resolver +
 *    a KernelContext and walks each entry, calling `onRegister`.
 *    This is for plugins shipped as `ShopVersePlugin` objects (not
 *    NestJS modules) — the cleaner contract per plan §7 / §10 E1.
 *
 * First-party plugins use path 1. Nothing was calling `loadAll()`, so
 * `PluginLoader.all()` returned [] in production AND in the test app,
 * which made `/admin/plugins` show "No plugins registered" even though
 * the manifest declared six and they were all running.
 *
 * What this service does
 * ──────────────────────
 * At `OnApplicationBootstrap` — i.e. AFTER NestJS finished wiring all
 * modules (otherwise plugin-module bootstrap would still be in
 * progress) — we walk the manifest and seed the loader's results map
 * with one entry per manifest plugin. We record `registered` for
 * enabled entries and `disabled` for `enabled: false` ones.
 *
 * Reaching this lifecycle hook implies every NestJS plugin module
 * already instantiated successfully (or the kernel would have crashed
 * earlier). So "manifest entry exists" == "plugin loaded" is a safe
 * derivation for first-party plugins.
 *
 * For future SDK-style plugins loaded via `PluginLoader.loadAll()`,
 * that path overwrites these seeded entries with real
 * register/disabled/version-mismatch/register-failed statuses
 * — `seedManifestResult` and `loadAll` share the same `results` map.
 */
@Injectable()
export class PluginBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PluginBootstrapService.name);

  constructor(private readonly loader: PluginLoader) {}

  onApplicationBootstrap(): void {
    // Pull from the same manifest the resolver uses, so the loader's
    // view stays perfectly aligned with what NestJS actually loaded.
    const manifest = pluginsConfig as PluginManifest;

    for (const entry of manifest.plugins) {
      this.loader.seedManifestResult(
        entry.id,
        entry.enabled ? 'registered' : 'disabled',
      );
    }

    this.logger.log(
      `Seeded PluginLoader with ${manifest.plugins.length} manifest entr` +
        `${manifest.plugins.length === 1 ? 'y' : 'ies'}`,
    );
  }
}
