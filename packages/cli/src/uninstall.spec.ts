// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PluginManifest } from '@shopverse/sdk';
import { planUninstall } from './uninstall';

function makeRepoRoot(schemaContent?: string, pluginTail = 'blog'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uninstall-'));
  if (schemaContent !== undefined) {
    fs.mkdirSync(path.join(dir, 'prisma', 'schema'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'prisma', 'schema', `${pluginTail}.prisma`),
      schemaContent,
    );
  }
  return dir;
}

function manifestWith(id: string, workspacePath = './plugins/blog'): PluginManifest {
  return {
    kernelVersion: '0.1.0-alpha.1',
    plugins: [
      {
        id,
        source: 'workspace',
        workspacePath,
        enabled: true,
      },
    ],
  };
}

describe('plugin:uninstall', () => {
  it('returns a guidance message when entry exists and --drop-data is not set', () => {
    const repoRoot = makeRepoRoot();
    const result = planUninstall({
      manifest: manifestWith('@shopverse/plugin-blog'),
      pluginId: '@shopverse/plugin-blog',
      dropData: false,
      repoRoot,
    });
    expect(result.entry).toBeDefined();
    expect(result.dropStatements).toHaveLength(0);
    const joined = result.messages.join('\n');
    expect(joined).toContain('@shopverse/plugin-blog');
    expect(joined).toContain('Data preserved');
    expect(joined).toContain('--drop-data');
  });

  it('returns "not in manifest" message when id is unknown', () => {
    const repoRoot = makeRepoRoot();
    const result = planUninstall({
      manifest: manifestWith('@shopverse/plugin-blog'),
      pluginId: '@shopverse/plugin-unknown',
      dropData: false,
      repoRoot,
    });
    expect(result.entry).toBeUndefined();
    expect(result.messages.join('\n')).toContain('not in the manifest');
  });

  it('--drop-data extracts DROP statements from the plugin schema file', () => {
    const repoRoot = makeRepoRoot(`
model BlogPost {
  id Int @id @default(autoincrement())
  title String
}

model BlogAuthor {
  id Int @id @default(autoincrement())
  name String
}
`);
    const result = planUninstall({
      manifest: manifestWith('@shopverse/plugin-blog'),
      pluginId: '@shopverse/plugin-blog',
      dropData: true,
      repoRoot,
    });
    expect(result.dropStatements).toContain('DROP TABLE IF EXISTS "BlogPost" CASCADE;');
    expect(result.dropStatements).toContain('DROP TABLE IF EXISTS "BlogAuthor" CASCADE;');
    expect(result.schemaFile).toBeDefined();
  });

  it('--drop-data with no schema file reports nothing to drop', () => {
    const repoRoot = makeRepoRoot();
    const result = planUninstall({
      manifest: manifestWith('@shopverse/plugin-blog'),
      pluginId: '@shopverse/plugin-blog',
      dropData: true,
      repoRoot,
    });
    expect(result.dropStatements).toHaveLength(0);
    expect(result.messages.join('\n')).toContain('nothing to drop');
  });

  it('infers the schema-file name from the id tail (strips `plugin-` prefix)', () => {
    const repoRoot = makeRepoRoot(`model Foo { id Int @id }`, 'blog');
    const result = planUninstall({
      manifest: manifestWith('@shopverse/plugin-blog'),
      pluginId: '@shopverse/plugin-blog',
      dropData: true,
      repoRoot,
    });
    // Expects prisma/schema/blog.prisma (NOT plugin-blog.prisma).
    expect(result.schemaFile).toContain('blog.prisma');
    expect(result.schemaFile).not.toContain('plugin-blog.prisma');
  });
});
