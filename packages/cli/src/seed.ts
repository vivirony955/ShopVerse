// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * W6.T8 — `shopverse plugin:seed [<id>]` (plan §10 E11).
 *
 * Iterates `plugins.config.ts` in declared order and, for each
 * enabled plugin, attempts to load `<workspacePath>/dist/seed.js`
 * (or `src/seed.ts` when the dev runtime supports TS strip-types).
 * If the module's default export is a function, it's invoked with
 * a `SeedContext` carrying the test/dev Prisma client.
 *
 * Plugin authors ship idempotent seeds — typical pattern is to use
 * Prisma `upsert` so a second invocation is a no-op. Per plan §10 E11
 * the convention is `seed(ctx)` returns void or a Promise.
 *
 * The CLI does NOT instantiate Prisma itself; it requires the caller
 * (or the operator's wrapper script) to inject a configured client.
 * For the in-repo dev flow, the seed runner can call this with the
 * test helpers' shared Prisma client. For production seed (rare),
 * connect using the operator's preferred credentials.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PluginManifest, PluginManifestEntry } from '@shopverse/sdk';

export interface SeedContext {
  /**
   * Prisma client (loose-typed so the SDK doesn't take a runtime
   * dep on @prisma/client). Plugins cast to PrismaClient locally.
   */
  prisma: unknown;
}

export type PluginSeedFn = (ctx: SeedContext) => void | Promise<void>;

export interface SeedRunOptions {
  manifest: PluginManifest;
  /** When set, only seed this plugin id. */
  onlyPluginId?: string;
  ctx: SeedContext;
  /** Resolved against process.cwd() when loading plugin entry points. */
  repoRoot?: string;
  /** Stub for testing — defaults to require(). */
  loader?: (absPath: string) => unknown;
}

export interface SeedResult {
  pluginId: string;
  status: 'seeded' | 'no-seed' | 'skipped' | 'failed';
  reason?: string;
}

function resolveSeedEntry(
  repoRoot: string,
  entry: PluginManifestEntry,
): string | undefined {
  if (entry.source !== 'workspace' || !entry.workspacePath) return undefined;
  const base = path.resolve(repoRoot, 'backend', entry.workspacePath);
  // Production-shaped path first, dev shape as fallback.
  const dist = path.join(base, 'dist', 'seed.js');
  if (fs.existsSync(dist)) return dist;
  const src = path.join(base, 'src', 'seed.ts');
  if (fs.existsSync(src)) return src;
  return undefined;
}

function pickDefault(mod: unknown): PluginSeedFn | undefined {
  if (!mod || typeof mod !== 'object') return undefined;
  const m = mod as { default?: unknown; seed?: unknown };
  if (typeof m.default === 'function') return m.default as PluginSeedFn;
  if (typeof m.seed === 'function') return m.seed as PluginSeedFn;
  return undefined;
}

export async function seedAll(opts: SeedRunOptions): Promise<SeedResult[]> {
  const repoRoot = opts.repoRoot ?? process.cwd();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loader = opts.loader ?? ((p: string) => require(p));
  const results: SeedResult[] = [];

  for (const entry of opts.manifest.plugins) {
    if (opts.onlyPluginId && entry.id !== opts.onlyPluginId) continue;
    if (!entry.enabled) {
      results.push({ pluginId: entry.id, status: 'skipped', reason: 'disabled in manifest' });
      continue;
    }
    if (entry.source !== 'workspace') {
      results.push({
        pluginId: entry.id,
        status: 'skipped',
        reason: `source=${entry.source} (only workspace plugins supported today)`,
      });
      continue;
    }
    const seedFile = resolveSeedEntry(repoRoot, entry);
    if (!seedFile) {
      results.push({ pluginId: entry.id, status: 'no-seed' });
      continue;
    }
    try {
      const mod = loader(seedFile);
      const fn = pickDefault(mod);
      if (!fn) {
        results.push({
          pluginId: entry.id,
          status: 'failed',
          reason: `${path.basename(seedFile)} has no default export / seed export`,
        });
        continue;
      }
      await fn(opts.ctx);
      results.push({ pluginId: entry.id, status: 'seeded' });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      results.push({ pluginId: entry.id, status: 'failed', reason });
    }
  }

  return results;
}

export function formatSeedReport(results: ReadonlyArray<SeedResult>): string {
  const lines: string[] = [];
  for (const r of results) {
    const tag =
      r.status === 'seeded'
        ? '✓ seeded'
        : r.status === 'no-seed'
          ? '· no seed file'
          : r.status === 'skipped'
            ? '· skipped'
            : '✗ failed';
    lines.push(`${tag.padEnd(15)} ${r.pluginId}${r.reason ? ` — ${r.reason}` : ''}`);
  }
  return lines.join('\n');
}

export function allSucceededSeed(results: ReadonlyArray<SeedResult>): boolean {
  return results.every((r) => r.status !== 'failed');
}
