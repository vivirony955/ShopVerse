// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import type {
  KernelContext,
  PluginManifest,
  ShopVersePlugin,
} from '@shopverse/sdk';
import { PluginLoader } from './plugin-loader.service';

function noopKernel(): KernelContext {
  const noop = () => undefined;
  return {
    hooks: { register: noop as never },
    events: {
      subscribe: noop as never,
      publishCustom: () => Promise.resolve(),
      subscribeCustom: noop as never,
    },
    strategies: { register: noop as never },
    logger: { log: noop, warn: noop, error: noop, debug: noop },
    audit: { log: () => Promise.resolve() },
    crons: { register: noop as never },
    queues: { register: noop as never },
    api: { registerRoutes: noop as never },
  };
}

function plugin(
  id: string,
  overrides: Partial<ShopVersePlugin> = {},
): ShopVersePlugin {
  return {
    id,
    version: '1.0.0',
    kernelVersion: '^0.1.0',
    onRegister: () => Promise.resolve(),
    ...overrides,
  };
}

describe('PluginLoader', () => {
  let loader: PluginLoader;
  beforeEach(() => {
    loader = new PluginLoader();
  });

  const manifestOf = (
    ...entries: PluginManifest['plugins']
  ): PluginManifest => ({
    kernelVersion: '0.1.0',
    plugins: entries,
  });

  it('registers a healthy plugin', async () => {
    const p = plugin('@shopverse/foo');
    const onRegister = jest.spyOn(p, 'onRegister');

    const results = await loader.loadAll(
      manifestOf({
        id: p.id,
        source: 'workspace',
        workspacePath: '.',
        enabled: true,
      }),
      '0.1.0',
      noopKernel(),
      () => ({ default: p }),
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: p.id, status: 'registered' });
    expect(onRegister).toHaveBeenCalledTimes(1);
  });

  it('skips disabled plugins without calling onRegister', async () => {
    const p = plugin('@shopverse/foo');
    const onRegister = jest.spyOn(p, 'onRegister');

    const [result] = await loader.loadAll(
      manifestOf({
        id: p.id,
        source: 'workspace',
        workspacePath: '.',
        enabled: false,
      }),
      '0.1.0',
      noopKernel(),
      () => p,
    );

    expect(result.status).toBe('disabled');
    expect(onRegister).not.toHaveBeenCalled();
  });

  it('catches onRegister throw, marks register-failed, continues boot', async () => {
    const bad = plugin('@shopverse/bad', {
      onRegister: () => Promise.reject(new Error('boom in plugin')),
    });
    const good = plugin('@shopverse/good');
    const goodRegister = jest.spyOn(good, 'onRegister');

    const results = await loader.loadAll(
      manifestOf(
        { id: bad.id, source: 'workspace', workspacePath: '.', enabled: true },
        { id: good.id, source: 'workspace', workspacePath: '.', enabled: true },
      ),
      '0.1.0',
      noopKernel(),
      (entry) => (entry.id === bad.id ? bad : good),
    );

    expect(results[0]).toMatchObject({
      status: 'register-failed',
      error: 'boom in plugin',
    });
    expect(results[1]).toMatchObject({ status: 'registered' });
    expect(goodRegister).toHaveBeenCalledTimes(1);
  });

  it('skips on kernelVersion mismatch', async () => {
    const p = plugin('@shopverse/old', { kernelVersion: '^2.0.0' });
    const onRegister = jest.spyOn(p, 'onRegister');

    const [result] = await loader.loadAll(
      manifestOf({
        id: p.id,
        source: 'workspace',
        workspacePath: '.',
        enabled: true,
      }),
      '0.1.0',
      noopKernel(),
      () => p,
    );

    expect(result.status).toBe('version-mismatch');
    expect(onRegister).not.toHaveBeenCalled();
  });

  it('marks invalid when module does not export a ShopVersePlugin', async () => {
    const [result] = await loader.loadAll(
      manifestOf({
        id: 'x',
        source: 'workspace',
        workspacePath: '.',
        enabled: true,
      }),
      '0.1.0',
      noopKernel(),
      () => ({ something: 'else' }),
    );
    expect(result.status).toBe('invalid');
  });

  it('marks invalid when resolver throws', async () => {
    const [result] = await loader.loadAll(
      manifestOf({ id: 'x', source: 'npm', enabled: true }),
      '0.1.0',
      noopKernel(),
      () => {
        throw new Error('not found');
      },
    );
    expect(result.status).toBe('invalid');
    expect(result.error).toContain('not found');
  });

  it('rejects id mismatch between manifest and module', async () => {
    const p = plugin('@shopverse/foo');
    const [result] = await loader.loadAll(
      manifestOf({
        id: '@shopverse/wrong',
        source: 'workspace',
        workspacePath: '.',
        enabled: true,
      }),
      '0.1.0',
      noopKernel(),
      () => p,
    );
    expect(result.status).toBe('invalid');
    expect(result.error).toContain('does not match');
  });

  it('throws on invalid manifest (assertValidManifest)', async () => {
    await expect(
      loader.loadAll(
        { kernelVersion: 'bad', plugins: [] } as unknown as PluginManifest,
        '0.1.0',
        noopKernel(),
        () => null,
      ),
    ).rejects.toThrow(/Invalid plugins\.config\.ts/);
  });

  it('resultFor() returns per-plugin status', async () => {
    const p = plugin('@shopverse/foo');
    await loader.loadAll(
      manifestOf({
        id: p.id,
        source: 'workspace',
        workspacePath: '.',
        enabled: true,
      }),
      '0.1.0',
      noopKernel(),
      () => p,
    );
    expect(loader.resultFor(p.id)?.status).toBe('registered');
    expect(loader.resultFor('missing')).toBeUndefined();
  });
});
