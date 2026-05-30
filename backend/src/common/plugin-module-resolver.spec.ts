// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import type { PluginManifest } from '@shopverse/sdk';
import { resolvePluginModules } from './plugin-module-resolver';

/**
 * W4.CI1 + CI2 — manifest-driven plugin module resolution.
 *
 * Exercises every branch of the resolver against the real on-disk
 * price-alerts plugin (since it's already built and importable). The
 * resolver paths covered:
 *   - enabled: true workspace plugin → module class returned
 *   - enabled: false → silently skipped (W4.CI2 happy path)
 *   - source: npm → skipped (handled by plain-object PluginLoader)
 *   - source: workspace + missing workspacePath → error + skip
 *   - invalid workspacePath → require() throws → caught + skip
 *   - workspacePath resolves but no *PluginModule export → error + skip
 *
 * All failure paths must NOT crash boot — a bad plugin entry skips
 * that plugin and lets the rest of the kernel start (plan §10 E4).
 */
describe('resolvePluginModules', () => {
  const baseManifest = { kernelVersion: '0.1.0-alpha.1' as const };

  it('resolves an enabled workspace plugin to its NestJS module class', () => {
    const manifest: PluginManifest = {
      ...baseManifest,
      plugins: [
        {
          id: '@shopverse/plugin-price-alerts',
          source: 'workspace',
          workspacePath: './plugins/price-alerts/src',
          enabled: true,
        },
      ],
    };
    const modules = resolvePluginModules(manifest);
    expect(modules).toHaveLength(1);
    expect(modules[0].name).toBe('PriceAlertsPluginModule');
  });

  it('skips a workspace plugin with enabled: false (W4.CI2 disable path)', () => {
    const manifest: PluginManifest = {
      ...baseManifest,
      plugins: [
        {
          id: '@shopverse/plugin-price-alerts',
          source: 'workspace',
          workspacePath: './plugins/price-alerts/src',
          enabled: false,
        },
      ],
    };
    const modules = resolvePluginModules(manifest);
    expect(modules).toHaveLength(0);
  });

  it('skips npm-source plugins (they flow through PluginLoader)', () => {
    const manifest: PluginManifest = {
      ...baseManifest,
      plugins: [
        {
          id: '@third-party/plugin-foo',
          source: 'npm',
          enabled: true,
        },
      ],
    };
    const modules = resolvePluginModules(manifest);
    expect(modules).toHaveLength(0);
  });

  it('skips workspace entries that omit workspacePath', () => {
    const manifest: PluginManifest = {
      ...baseManifest,
      plugins: [
        {
          id: '@shopverse/plugin-broken',
          source: 'workspace',
          enabled: true,
        },
      ],
    };
    const modules = resolvePluginModules(manifest);
    expect(modules).toHaveLength(0);
  });

  it('catches require() failures (bad path) and skips the plugin', () => {
    const manifest: PluginManifest = {
      ...baseManifest,
      plugins: [
        {
          id: '@shopverse/plugin-does-not-exist',
          source: 'workspace',
          workspacePath: './plugins/nope/src',
          enabled: true,
        },
      ],
    };
    // Must NOT throw — boot continues even when a plugin path is wrong.
    expect(() => resolvePluginModules(manifest)).not.toThrow();
    expect(resolvePluginModules(manifest)).toHaveLength(0);
  });

  it('processes a mixed manifest: one enabled, one disabled, one npm', () => {
    const manifest: PluginManifest = {
      ...baseManifest,
      plugins: [
        {
          id: '@shopverse/plugin-price-alerts',
          source: 'workspace',
          workspacePath: './plugins/price-alerts/src',
          enabled: true,
        },
        {
          id: '@shopverse/plugin-price-alerts-clone',
          source: 'workspace',
          workspacePath: './plugins/price-alerts/src',
          enabled: false,
        },
        {
          id: '@third-party/plugin-foo',
          source: 'npm',
          enabled: true,
        },
      ],
    };
    const modules = resolvePluginModules(manifest);
    // Only the first entry resolves — the disabled and npm entries skip.
    expect(modules).toHaveLength(1);
    expect(modules[0].name).toBe('PriceAlertsPluginModule');
  });
});
