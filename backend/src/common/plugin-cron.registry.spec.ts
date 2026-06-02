// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { PluginCronRegistry } from './plugin-cron.registry';

describe('PluginCronRegistry', () => {
  let r: PluginCronRegistry;
  beforeEach(() => {
    r = new PluginCronRegistry();
  });

  it('registers a valid cron', () => {
    r.register('@shopverse/foo', {
      name: 'sync',
      intervalMinutes: 10,
      handler: () => Promise.resolve(),
    });
    expect(r.all()).toHaveLength(1);
    expect(r.countForPlugin('@shopverse/foo')).toBe(1);
  });

  it('rejects interval under 5 minutes', () => {
    expect(() =>
      r.register('@shopverse/foo', {
        name: 'sync',
        intervalMinutes: 2,
        handler: () => Promise.resolve(),
      }),
    ).toThrow(/rule #9/);
  });

  it('rejects second cron from the same plugin', () => {
    r.register('@shopverse/foo', {
      name: 'sync',
      intervalMinutes: 5,
      handler: () => Promise.resolve(),
    });
    expect(() =>
      r.register('@shopverse/foo', {
        name: 'other',
        intervalMinutes: 10,
        handler: () => Promise.resolve(),
      }),
    ).toThrow(/only one cron per plugin/);
  });

  it('rejects duplicate prefixed name across plugins', () => {
    r.register('@shopverse/foo', {
      name: 'sync',
      intervalMinutes: 5,
      handler: () => Promise.resolve(),
    });
    // Different plugin, same suffix is OK (prefix differs).
    expect(() =>
      r.register('@shopverse/bar', {
        name: 'sync',
        intervalMinutes: 5,
        handler: () => Promise.resolve(),
      }),
    ).not.toThrow();
    expect(r.all()).toHaveLength(2);
  });

  it('unregisterPlugin removes the cron', () => {
    r.register('@shopverse/foo', {
      name: 'sync',
      intervalMinutes: 5,
      handler: () => Promise.resolve(),
    });
    r.unregisterPlugin('@shopverse/foo');
    expect(r.all()).toHaveLength(0);
    expect(r.countForPlugin('@shopverse/foo')).toBe(0);
  });
});
