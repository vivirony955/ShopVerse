// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { PluginRouteRegistry } from './plugin-route.registry';

class FooController {}
class BarController {}

describe('PluginRouteRegistry', () => {
  let r: PluginRouteRegistry;
  beforeEach(() => {
    r = new PluginRouteRegistry();
  });

  it('registers a controller with tag', () => {
    r.register('@shopverse/foo', FooController, { tag: 'Plugin: Foo' });
    const all = r.all();
    expect(all).toHaveLength(1);
    expect(all[0].pluginId).toBe('@shopverse/foo');
    expect(all[0].controllerClass).toBe(FooController);
    expect(all[0].tag).toBe('Plugin: Foo');
  });

  it('rejects empty tag', () => {
    expect(() =>
      r.register('@shopverse/foo', FooController, { tag: '' }),
    ).toThrow(/non-empty tag/);
  });

  it('allows multiple controllers per plugin', () => {
    r.register('@shopverse/foo', FooController, { tag: 'Plugin: Foo' });
    r.register('@shopverse/foo', BarController, { tag: 'Plugin: Foo (admin)' });
    expect(r.forPlugin('@shopverse/foo')).toHaveLength(2);
  });

  it('unregisterPlugin removes only its registrations', () => {
    r.register('@shopverse/foo', FooController, { tag: 'Foo' });
    r.register('@shopverse/bar', BarController, { tag: 'Bar' });
    r.unregisterPlugin('@shopverse/foo');
    expect(r.all()).toHaveLength(1);
    expect(r.all()[0].pluginId).toBe('@shopverse/bar');
  });
});
