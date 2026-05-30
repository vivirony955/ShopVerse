// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PluginManifest } from '@shopverse/sdk';
import { seedAll, allSucceededSeed, formatSeedReport } from './seed';

function makeRepoRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'seed-'));
}

function manifestWith(
  entries: Array<{
    id: string;
    enabled?: boolean;
    workspacePath?: string;
    source?: 'workspace' | 'npm';
  }>,
): PluginManifest {
  return {
    kernelVersion: '0.1.0-alpha.1',
    plugins: entries.map((e) => ({
      id: e.id,
      source: e.source ?? 'workspace',
      workspacePath: e.workspacePath ?? `./plugins/${e.id.split('/').pop()}`,
      enabled: e.enabled ?? true,
    })),
  };
}

function setupPluginDir(
  repoRoot: string,
  workspacePath: string,
  hasSeed: boolean,
): string {
  const base = path.resolve(repoRoot, 'backend', workspacePath);
  if (hasSeed) {
    fs.mkdirSync(path.join(base, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(base, 'dist', 'seed.js'), '// stub');
  } else {
    fs.mkdirSync(base, { recursive: true });
  }
  return base;
}

describe('plugin:seed', () => {
  it('reports `seeded` when a plugin\'s seed module exports a default fn', async () => {
    const repoRoot = makeRepoRoot();
    setupPluginDir(repoRoot, './plugins/plugin-blog', true);
    const calls: number[] = [];
    const results = await seedAll({
      manifest: manifestWith([{ id: '@shopverse/plugin-blog' }]),
      ctx: { prisma: 'fake' },
      repoRoot,
      loader: () => ({
        default: () => {
          calls.push(1);
        },
      }),
    });
    expect(results).toEqual([{ pluginId: '@shopverse/plugin-blog', status: 'seeded' }]);
    expect(calls).toEqual([1]);
    expect(allSucceededSeed(results)).toBe(true);
  });

  it('reports `no-seed` when no seed file is present', async () => {
    const repoRoot = makeRepoRoot();
    setupPluginDir(repoRoot, './plugins/blog', false);
    const results = await seedAll({
      manifest: manifestWith([{ id: '@shopverse/plugin-blog' }]),
      ctx: { prisma: 'fake' },
      repoRoot,
    });
    expect(results[0].status).toBe('no-seed');
    expect(allSucceededSeed(results)).toBe(true);
  });

  it('reports `skipped` for disabled plugins', async () => {
    const repoRoot = makeRepoRoot();
    setupPluginDir(repoRoot, './plugins/plugin-blog', true);
    const results = await seedAll({
      manifest: manifestWith([{ id: '@shopverse/plugin-blog', enabled: false }]),
      ctx: { prisma: 'fake' },
      repoRoot,
      loader: () => ({ default: () => {} }),
    });
    expect(results[0].status).toBe('skipped');
    expect(results[0].reason).toContain('disabled');
  });

  it('reports `skipped` for npm-source plugins (workspace-only today)', async () => {
    const repoRoot = makeRepoRoot();
    const results = await seedAll({
      manifest: manifestWith([{ id: '@shopverse/plugin-blog', source: 'npm' }]),
      ctx: { prisma: 'fake' },
      repoRoot,
      loader: () => ({ default: () => {} }),
    });
    expect(results[0].status).toBe('skipped');
    expect(results[0].reason).toContain('workspace');
  });

  it('reports `failed` when the seed function throws', async () => {
    const repoRoot = makeRepoRoot();
    setupPluginDir(repoRoot, './plugins/plugin-blog', true);
    const results = await seedAll({
      manifest: manifestWith([{ id: '@shopverse/plugin-blog' }]),
      ctx: { prisma: 'fake' },
      repoRoot,
      loader: () => ({
        default: () => {
          throw new Error('boom');
        },
      }),
    });
    expect(results[0].status).toBe('failed');
    expect(results[0].reason).toBe('boom');
    expect(allSucceededSeed(results)).toBe(false);
  });

  it('reports `failed` when the module has no default / no seed export', async () => {
    const repoRoot = makeRepoRoot();
    setupPluginDir(repoRoot, './plugins/plugin-blog', true);
    const results = await seedAll({
      manifest: manifestWith([{ id: '@shopverse/plugin-blog' }]),
      ctx: { prisma: 'fake' },
      repoRoot,
      loader: () => ({ notDefault: 'oops' }),
    });
    expect(results[0].status).toBe('failed');
    expect(results[0].reason).toContain('no default export');
  });

  it('honours `onlyPluginId` filter — runs just that one plugin', async () => {
    const repoRoot = makeRepoRoot();
    setupPluginDir(repoRoot, './plugins/plugin-blog', true);
    setupPluginDir(repoRoot, './plugins/plugin-notifications', true);
    const results = await seedAll({
      manifest: manifestWith([
        { id: '@shopverse/plugin-blog' },
        { id: '@shopverse/plugin-notifications' },
      ]),
      ctx: { prisma: 'fake' },
      onlyPluginId: '@shopverse/plugin-notifications',
      repoRoot,
      loader: () => ({ default: () => {} }),
    });
    expect(results).toHaveLength(1);
    expect(results[0].pluginId).toBe('@shopverse/plugin-notifications');
  });

  it('formatSeedReport renders a tag prefix per status', () => {
    const out = formatSeedReport([
      { pluginId: 'a', status: 'seeded' },
      { pluginId: 'b', status: 'no-seed' },
      { pluginId: 'c', status: 'skipped', reason: 'disabled in manifest' },
      { pluginId: 'd', status: 'failed', reason: 'boom' },
    ]);
    expect(out).toContain('✓ seeded');
    expect(out).toContain('· no seed file');
    expect(out).toContain('· skipped');
    expect(out).toContain('✗ failed');
    expect(out).toContain('boom');
  });
});
