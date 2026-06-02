// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  assertValidManifest,
  type PluginManifest,
  type PluginManifestEntry,
} from '@shopverse/sdk';

/**
 * Plugin migration runner — plan §10 E9 (W1.T26).
 *
 * Iterates plugins in the order declared in `plugins.config.ts` and
 * runs each plugin's Prisma migrations against the configured database.
 *
 * Ordering rule (plan §10 E9): "plugins are migrated in the order
 * declared in plugins.config.ts. This is critical: if plugin B
 * references plugin A's data via the SDK, A's schema must be ready
 * first."
 *
 * Plugin migration directory resolution:
 *   - source: 'workspace' → <workspacePath>/prisma/schema/migrations
 *   - source: 'npm'       → node_modules/<id>/prisma/schema/migrations
 *
 * Each plugin's prisma is invoked as `prisma migrate deploy --schema
 * <plugin-dir>/prisma/schema/` against the shared DATABASE_URL. The
 * `_prisma_migrations` table is namespaced per-plugin by Prisma's
 * default migration tracking — collisions are caller's responsibility.
 *
 * Failures stop the run. Each plugin reports its own status so
 * operators can see exactly where ordering broke.
 */

export interface PluginMigrationResult {
  readonly pluginId: string;
  readonly status: 'applied' | 'skipped' | 'failed';
  readonly reason?: string;
}

export interface MigrationRunner {
  /**
   * Resolve a plugin entry to an absolute filesystem path. Default
   * resolver does `require.resolve` for npm sources and `path.resolve`
   * for workspace sources.
   */
  resolvePluginDir(entry: PluginManifestEntry): string;
  /**
   * Run `prisma migrate deploy` against `schemaDir`. Returns exit code.
   * Default implementation spawns the prisma CLI. Tests inject their
   * own runner.
   */
  applyMigrations(schemaDir: string): { exitCode: number; stderr: string };
}

export class DefaultMigrationRunner implements MigrationRunner {
  constructor(private readonly cwd: string = process.cwd()) {}

  resolvePluginDir(entry: PluginManifestEntry): string {
    if (entry.source === 'workspace') {
      if (!entry.workspacePath) {
        throw new Error(
          `Plugin "${entry.id}" has source="workspace" but no workspacePath`,
        );
      }
      return path.resolve(this.cwd, entry.workspacePath);
    }
    // npm — assume installed under node_modules/<id>.
    return path.resolve(this.cwd, 'node_modules', entry.id);
  }

  applyMigrations(schemaDir: string): { exitCode: number; stderr: string } {
    const result = spawnSync(
      'npx',
      ['prisma', 'migrate', 'deploy', '--schema', schemaDir],
      { cwd: this.cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: true },
    );
    return {
      exitCode: result.status ?? 1,
      stderr: result.stderr?.toString() ?? '',
    };
  }
}

/**
 * Run migrations for every plugin in the manifest, in declared order.
 * Stops on first failure; remaining plugins are not attempted.
 */
export function migrateAll(
  manifest: PluginManifest,
  runner: MigrationRunner = new DefaultMigrationRunner(),
): readonly PluginMigrationResult[] {
  assertValidManifest(manifest);
  const results: PluginMigrationResult[] = [];

  for (const entry of manifest.plugins) {
    if (!entry.enabled) {
      results.push({
        pluginId: entry.id,
        status: 'skipped',
        reason: 'disabled in manifest',
      });
      continue;
    }

    const pluginDir = runner.resolvePluginDir(entry);
    const schemaDir = path.join(pluginDir, 'prisma', 'schema');

    if (!fs.existsSync(schemaDir)) {
      results.push({
        pluginId: entry.id,
        status: 'skipped',
        reason: `no prisma/schema directory at ${schemaDir}`,
      });
      continue;
    }

    const { exitCode, stderr } = runner.applyMigrations(schemaDir);
    if (exitCode === 0) {
      results.push({ pluginId: entry.id, status: 'applied' });
    } else {
      results.push({
        pluginId: entry.id,
        status: 'failed',
        reason: stderr.trim() || `prisma migrate deploy exited ${exitCode}`,
      });
      // Stop on first failure — ordering matters.
      break;
    }
  }

  return results;
}

/** Convenience — true if every plugin applied or skipped successfully. */
export function allSucceeded(results: readonly PluginMigrationResult[]): boolean {
  return results.every((r) => r.status !== 'failed');
}
