// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import type { KernelContext, PluginCronSpec, PluginRouteOptions } from '@shopverse/sdk';
import plugin, { PRICE_DROP_TOPIC } from '../src/index';

/**
 * Smoke test — onRegister runs against a fake KernelContext and we
 * assert the plugin made every expected registration. Catches the
 * obvious regressions (cron forgotten, hook forgotten, controller
 * forgotten) without spinning up the real Nest app.
 *
 * The real end-to-end test lands once dynamic controller-attach +
 * cron bootstrapping ship in W2 session 2 — that test exercises the
 * full HTTP route through PluginRouteRegistry.
 */

interface Recorded {
  hooks: string[];
  crons: PluginCronSpec[];
  routes: Array<{ tag: string }>;
  customSubscriptions: string[];
}

function fakeKernel(): { ctx: KernelContext; recorded: Recorded } {
  const recorded: Recorded = {
    hooks: [],
    crons: [],
    routes: [],
    customSubscriptions: [],
  };
  const noop = () => undefined;

  const ctx: KernelContext = {
    hooks: {
      register: (name: string) => {
        recorded.hooks.push(name);
      },
    } as KernelContext['hooks'],
    events: {
      subscribe: noop as never,
      publishCustom: () => Promise.resolve(),
      subscribeCustom: ((topic: string) => {
        recorded.customSubscriptions.push(topic);
      }) as KernelContext['events']['subscribeCustom'],
    },
    strategies: { register: noop as never },
    logger: { log: noop, warn: noop, error: noop, debug: noop },
    audit: { log: () => Promise.resolve() },
    crons: {
      register: (spec: PluginCronSpec) => {
        recorded.crons.push(spec);
      },
    },
    queues: { register: noop as never },
    api: {
      registerRoutes: (
        _ctrl: new (...args: unknown[]) => unknown,
        opts: PluginRouteOptions,
      ) => {
        recorded.routes.push({ tag: opts.tag });
      },
    },
    config: {
      get: () => Promise.resolve(null),
      set: () => Promise.resolve(),
      delete: () => Promise.resolve(),
    },
    db: {}, // smoke test doesn't exercise db calls
  };

  return { ctx, recorded };
}

describe('@shopverse/plugin-price-alerts smoke', () => {
  it('exports a valid ShopVersePlugin', () => {
    expect(plugin.id).toBe('@shopverse/plugin-price-alerts');
    expect(plugin.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(plugin.kernelVersion).toBe('^0.1.0');
    expect(typeof plugin.onRegister).toBe('function');
  });

  it('registers the user.beforeDelete hook (GDPR cascade)', async () => {
    const { ctx, recorded } = fakeKernel();
    await plugin.onRegister(ctx);
    expect(recorded.hooks).toContain('user.beforeDelete');
  });

  it('registers the hourly check-alerts cron', async () => {
    const { ctx, recorded } = fakeKernel();
    await plugin.onRegister(ctx);
    expect(recorded.crons).toHaveLength(1);
    expect(recorded.crons[0].name).toBe('check-alerts');
    expect(recorded.crons[0].intervalMinutes).toBe(60);
  });

  it('registers the REST controller under its tag', async () => {
    const { ctx, recorded } = fakeKernel();
    await plugin.onRegister(ctx);
    expect(recorded.routes).toHaveLength(1);
    expect(recorded.routes[0].tag).toBe('Plugin: Price Alerts');
  });

  it('exposes the price-drop topic constant for kernel email consumer', () => {
    expect(PRICE_DROP_TOPIC).toBe(
      '@shopverse/plugin-price-alerts.price-drop',
    );
  });
});
