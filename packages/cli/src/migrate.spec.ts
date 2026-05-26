// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PluginManifest, PluginManifestEntry } from '@shopverse/sdk';
import { allSucceeded, type MigrationRunner, migrateAll } from './migrate';

/**
 * Fake runner: records every applyMigrations call, lets each test set
 * up the directory structure and exit codes. resolvePluginDir maps a
 * plugin id to a temp directory created in beforeEach.
 */
class FakeRunner implements MigrationRunner {
  applied: string[] = [];
  exitMap = new Map<string, number>(); // pluginId → exit code
  stderrMap = new Map<string, string>();
  private dirMap = new Map<string, string>();

  setDir(pluginId: string, dir: string): void {
    this.dirMap.set(pluginId, dir);
  }

  resolvePluginDir(entry: PluginManifestEntry): string {
    return this.dirMap.get(entry.id) ?? `/nonexistent/${entry.id}`;
  }

  applyMigrations(schemaDir: string): { exitCode: number; stderr: string } {
    this.applied.push(schemaDir);
    // Map back to plugin id from the schemaDir path.
    for (const [id, dir] of this.dirMap) {
      if (schemaDir.startsWith(dir)) {
        return {
          exitCode: this.exitMap.get(id) ?? 0,
          stderr: this.stderrMap.get(id) ?? '',
        };
      }
    }
    return { exitCode: 0, stderr: '' };
  }
}

function makePluginDir(id: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `plugin-${id.replace(/[^a-z0-9]/gi, '_')}-`));
  fs.mkdirSync(path.join(dir, 'prisma', 'schema'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'prisma', 'schema', 'plugin.prisma'),
    '// placeholder\n',
  );
  return dir;
}

function manifestOf(...entries: PluginManifestEntry[]): PluginManifest {
  return { kernelVersion: '0.1.0', plugins: entries };
}

describe('migrateAll', () => {
  let runner: FakeRunner;
  const created: string[] = [];

  beforeEach(() => {
    runner = new FakeRunner();
  });

  afterEach(() => {
    for (const d of created.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('applies plugins in declared order', () => {
    const a = makePluginDir('@p/a');
    const b = makePluginDir('@p/b');
    created.push(a, b);
    runner.setDir('@p/a', a);
    runner.setDir('@p/b', b);

    const results = migrateAll(
      manifestOf(
        { id: '@p/a', source: 'workspace', workspacePath: a, enabled: true },
        { id: '@p/b', source: 'workspace', workspacePath: b, enabled: true },
      ),
      runner,
    );

    expect(results.map((r) => r.status)).toEqual(['applied', 'applied']);
    expect(runner.applied[0]).toContain(a);
    expect(runner.applied[1]).toContain(b);
  });

  it('skips disabled plugins', () => {
    const a = makePluginDir('@p/a');
    created.push(a);
    runner.setDir('@p/a', a);

    const results = migrateAll(
      manifestOf({
        id: '@p/a',
        source: 'workspace',
        workspacePath: a,
        enabled: false,
      }),
      runner,
    );

    expect(results[0]).toMatchObject({ status: 'skipped', reason: /disabled/ });
    expect(runner.applied).toHaveLength(0);
  });

  it('skips plugins without a prisma/schema directory', () => {
    const a = fs.mkdtempSync(path.join(os.tmpdir(), 'no-prisma-'));
    created.push(a);
    runner.setDir('@p/a', a);

    const [result] = migrateAll(
      manifestOf({
        id: '@p/a',
        source: 'workspace',
        workspacePath: a,
        enabled: true,
      }),
      runner,
    );

    expect(result.status).toBe('skipped');
    expect(result.reason).toContain('no prisma/schema directory');
  });

  it('stops on first failure', () => {
    const a = makePluginDir('@p/a');
    const b = makePluginDir('@p/b');
    const c = makePluginDir('@p/c');
    created.push(a, b, c);
    runner.setDir('@p/a', a);
    runner.setDir('@p/b', b);
    runner.setDir('@p/c', c);
    runner.exitMap.set('@p/b', 1);
    runner.stderrMap.set('@p/b', 'simulated failure');

    const results = migrateAll(
      manifestOf(
        { id: '@p/a', source: 'workspace', workspacePath: a, enabled: true },
        { id: '@p/b', source: 'workspace', workspacePath: b, enabled: true },
        { id: '@p/c', source: 'workspace', workspacePath: c, enabled: true },
      ),
      runner,
    );

    expect(results.map((r) => r.status)).toEqual(['applied', 'failed']);
    expect(results).toHaveLength(2); // C never attempted
    expect(results[1].reason).toContain('simulated failure');
    expect(allSucceeded(results)).toBe(false);
  });

  it('throws on invalid manifest before doing any work', () => {
    expect(() =>
      migrateAll(
        { kernelVersion: 'bad', plugins: [] } as unknown as PluginManifest,
        runner,
      ),
    ).toThrow(/Invalid plugins\.config\.ts/);
    expect(runner.applied).toHaveLength(0);
  });

  it('allSucceeded returns true when only applied + skipped', () => {
    expect(
      allSucceeded([
        { pluginId: 'a', status: 'applied' },
        { pluginId: 'b', status: 'skipped' },
      ]),
    ).toBe(true);
  });
});
