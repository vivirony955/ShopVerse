// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Logger, Type } from '@nestjs/common';
import * as path from 'path';
import type { PluginManifest } from '@shopverse/sdk';

/**
 * Resolve enabled WORKSPACE plugins from the manifest into NestJS
 * module classes for AppModule's `imports:` array.
 *
 * Runs SYNCHRONOUSLY at @Module-decoration time — i.e., BEFORE
 * `NestFactory.create` is called. This sidesteps the "PluginLoader
 * vs NestFactory.create timing" issue session 8 hit: by the time
 * Nest starts compiling the module graph, the plugin module classes
 * are already in the static `imports:` array. Nest doesn't know they
 * came from a manifest read — they look like any other import.
 *
 * This resolver handles ONLY the first-party / workspace plugin path
 * (NestJS DynamicModule classes, statically built into the backend
 * image). The PLAIN-OBJECT `ShopVersePlugin` path (third-party,
 * npm-distributed) goes through the separate `PluginLoader` service —
 * those plugins don't get NestJS DI and don't appear in this array.
 *
 * Plan refs: §10 E1 (manifest schema), §10 E3 (kernelVersion mismatch
 * is non-fatal but logged), §10 E4 (per-plugin isolation: a bad path
 * skips the plugin without grounding the boot).
 */
const logger = new Logger('PluginModuleResolver');

export function resolvePluginModules(
  manifest: PluginManifest,
): Type<unknown>[] {
  const modules: Type<unknown>[] = [];

  // __dirname at runtime is `backend/dist/common/` (prod) or
  // `backend/src/common/` (dev via ts-node). Either way, going up 2
  // gets us to the build/source root that mirrors `backend/`.
  const backendRoot = path.resolve(__dirname, '..', '..');

  for (const entry of manifest.plugins) {
    if (!entry.enabled) {
      logger.warn(
        `Plugin ${entry.id} disabled in manifest — skipping onRegister`,
      );
      continue;
    }

    if (entry.source !== 'workspace') {
      // npm-source plugins flow through the plain-object PluginLoader
      // path (W1.T19), not this NestJS-DynamicModule resolver. The
      // manifest can carry both kinds; we just skip the npm ones here.
      logger.log(
        `Plugin ${entry.id}: source='${entry.source}' handled by PluginLoader (skipped by module resolver)`,
      );
      continue;
    }

    if (!entry.workspacePath) {
      logger.error(
        `Plugin ${entry.id}: source=workspace requires workspacePath — skipping`,
      );
      continue;
    }

    const absPath = path.resolve(backendRoot, entry.workspacePath);
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(absPath) as unknown;
      const cls = pickModuleExport(mod);
      if (!cls) {
        logger.error(
          `Plugin ${entry.id}: no *PluginModule export found at ${entry.workspacePath} — skipping`,
        );
        continue;
      }
      logger.log(
        `Plugin ${entry.id} registered (${entry.workspacePath} → ${cls.name})`,
      );
      modules.push(cls);
    } catch (err) {
      logger.error(
        `Plugin ${entry.id}: failed to resolve ${entry.workspacePath}: ${err instanceof Error ? err.message : String(err)} — skipping`,
      );
    }
  }

  return modules;
}

/**
 * Pick the NestJS module class from a plugin's CJS exports. Tried in
 * order: direct class, ES `default`, first export ending in
 * `PluginModule`. Returns null if no candidate matches.
 */
function pickModuleExport(mod: unknown): Type<unknown> | null {
  if (!mod) return null;
  if (typeof mod === 'function') return mod as Type<unknown>;
  if (typeof mod !== 'object') return null;
  const obj = mod as Record<string, unknown>;
  if (typeof obj.default === 'function') return obj.default as Type<unknown>;
  for (const key of Object.keys(obj)) {
    if (key.endsWith('PluginModule') && typeof obj[key] === 'function') {
      return obj[key] as Type<unknown>;
    }
  }
  return null;
}
