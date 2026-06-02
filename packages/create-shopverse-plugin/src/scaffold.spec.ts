// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { scaffold } from './scaffold';

function makeRepoRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-'));
}

function readFile(repoRoot: string, rel: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('scaffold', () => {
  it('emits 5 backend files for a minimal plugin', () => {
    const repoRoot = makeRepoRoot();
    const result = scaffold({
      name: 'my-feature',
      repoRoot,
      withFrontend: false,
      withSchema: false,
    });
    expect(result.pluginId).toBe('@shopverse/plugin-my-feature');
    expect(result.filesWritten).toHaveLength(5);
    expect(result.filesWritten).toContain('backend/plugins/my-feature/package.json');
    expect(result.filesWritten).toContain('backend/plugins/my-feature/tsconfig.json');
    expect(result.filesWritten).toContain('backend/plugins/my-feature/src/index.ts');
    expect(result.filesWritten).toContain('backend/plugins/my-feature/src/my-feature.module.ts');
    expect(result.filesWritten).toContain('backend/plugins/my-feature/README.md');
  });

  it('adds 2 frontend files when --frontend is set', () => {
    const repoRoot = makeRepoRoot();
    const result = scaffold({
      name: 'shiny-thing',
      repoRoot,
      withFrontend: true,
      withSchema: false,
    });
    expect(result.filesWritten).toHaveLength(7);
    expect(result.filesWritten).toContain('frontend/src/plugins/shiny-thing/ShinyThingWidget.tsx');
    expect(result.filesWritten).toContain('frontend/src/plugins/shiny-thing/index.ts');
  });

  it('adds the prisma schema file when --schema is set', () => {
    const repoRoot = makeRepoRoot();
    const result = scaffold({
      name: 'datatron',
      repoRoot,
      withFrontend: false,
      withSchema: true,
    });
    expect(result.filesWritten).toHaveLength(6);
    expect(result.filesWritten).toContain('prisma/schema/datatron.prisma');
  });

  it('PascalCase-converts the name for class/widget names', () => {
    const repoRoot = makeRepoRoot();
    scaffold({ name: 'my-cool-feature', repoRoot, withFrontend: true, withSchema: false });
    const moduleSrc = readFile(repoRoot, 'backend/plugins/my-cool-feature/src/my-cool-feature.module.ts');
    expect(moduleSrc).toContain('class MyCoolFeatureBootstrap');
    expect(moduleSrc).toContain('export class MyCoolFeaturePluginModule');
    const widgetSrc = readFile(repoRoot, 'frontend/src/plugins/my-cool-feature/MyCoolFeatureWidget.tsx');
    expect(widgetSrc).toContain('function MyCoolFeatureWidget');
  });

  it('emits package.json with @shopverse/plugin-<name> id + sdk peer dep', () => {
    const repoRoot = makeRepoRoot();
    scaffold({ name: 'demo', repoRoot, withFrontend: false, withSchema: false });
    const pkg = JSON.parse(readFile(repoRoot, 'backend/plugins/demo/package.json'));
    expect(pkg.name).toBe('@shopverse/plugin-demo');
    expect(pkg.peerDependencies['@shopverse/sdk']).toBeDefined();
  });

  it('rejects when the backend dir already exists', () => {
    const repoRoot = makeRepoRoot();
    fs.mkdirSync(path.join(repoRoot, 'backend', 'plugins', 'collider'), { recursive: true });
    expect(() =>
      scaffold({ name: 'collider', repoRoot, withFrontend: false, withSchema: false }),
    ).toThrow(/already exists/);
  });

  it('rejects names that are too short / wrongly formatted', () => {
    const repoRoot = makeRepoRoot();
    expect(() => scaffold({ name: 'a', repoRoot, withFrontend: false, withSchema: false })).toThrow(
      /at least 2/,
    );
    expect(() =>
      scaffold({ name: 'BadCase', repoRoot, withFrontend: false, withSchema: false }),
    ).toThrow(/lowercase/);
    expect(() =>
      scaffold({ name: '1starts-with-digit', repoRoot, withFrontend: false, withSchema: false }),
    ).toThrow(/lowercase/);
    expect(() =>
      scaffold({ name: 'ends-with-', repoRoot, withFrontend: false, withSchema: false }),
    ).toThrow(/lowercase/);
  });

  it('emits backend module that uses the right hook + event signatures', () => {
    // Regression guard — the W6.T10 build caught the case where the
    // tutorial said `hooks.register(name, handler)` (2 args) but the
    // real signature is `hooks.register(name, pluginId, handler)`.
    // The scaffold MUST emit the 3-arg shape.
    const repoRoot = makeRepoRoot();
    scaffold({ name: 'demo', repoRoot, withFrontend: false, withSchema: false });
    const src = readFile(repoRoot, 'backend/plugins/demo/src/demo.module.ts');
    expect(src).toMatch(/hooks\.register\('cart\.beforeReserve',\s*PLUGIN_ID,/);
    expect(src).toMatch(/eventBus\.subscribe\('order\.placed',\s*PLUGIN_ID,/);
  });

  it('reports nextSteps that cover manifest edit + frontend wiring when applicable', () => {
    const repoRoot = makeRepoRoot();
    const minimal = scaffold({ name: 'demo', repoRoot, withFrontend: false, withSchema: false });
    expect(minimal.nextSteps.some((s) => s.includes('plugins.config.ts'))).toBe(true);
    expect(minimal.nextSteps.some((s) => s.includes('slot-registrations'))).toBe(false);

    const repoRoot2 = makeRepoRoot();
    const full = scaffold({ name: 'demo2', repoRoot: repoRoot2, withFrontend: true, withSchema: true });
    expect(full.nextSteps.some((s) => s.includes('slot-registrations'))).toBe(true);
    expect(full.nextSteps.some((s) => s.includes('prisma migrate'))).toBe(true);
  });
});
