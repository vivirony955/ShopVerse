// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { PluginQueueRegistry } from './plugin-queue.registry';

describe('PluginQueueRegistry', () => {
  let r: PluginQueueRegistry;
  beforeEach(() => {
    r = new PluginQueueRegistry();
  });

  const noopProcessor = () => Promise.resolve();

  it('registers a valid queue with default concurrency=1', () => {
    r.register('@shopverse/foo', { name: 'emails', processor: noopProcessor });
    const queues = r.all();
    expect(queues).toHaveLength(1);
    expect(queues[0].prefixedName).toBe('@shopverse/foo:emails');
    expect(queues[0].concurrency).toBe(1);
  });

  it('honours explicit concurrency', () => {
    r.register('@shopverse/foo', {
      name: 'emails',
      concurrency: 5,
      processor: noopProcessor,
    });
    expect(r.all()[0].concurrency).toBe(5);
  });

  it('rejects concurrency outside [1, 10]', () => {
    expect(() =>
      r.register('@shopverse/foo', {
        name: 'x',
        concurrency: 0,
        processor: noopProcessor,
      }),
    ).toThrow(/\[1, 10\]/);
    expect(() =>
      r.register('@shopverse/foo', {
        name: 'y',
        concurrency: 20,
        processor: noopProcessor,
      }),
    ).toThrow(/\[1, 10\]/);
  });

  it('rejects empty name', () => {
    expect(() =>
      r.register('@shopverse/foo', { name: '', processor: noopProcessor }),
    ).toThrow(/non-empty/);
  });

  it('rejects duplicate prefixed name', () => {
    r.register('@shopverse/foo', { name: 'x', processor: noopProcessor });
    expect(() =>
      r.register('@shopverse/foo', { name: 'x', processor: noopProcessor }),
    ).toThrow(/Duplicate/);
  });

  it('two plugins may share a suffix (prefix differs)', () => {
    r.register('@shopverse/foo', { name: 'emails', processor: noopProcessor });
    r.register('@shopverse/bar', { name: 'emails', processor: noopProcessor });
    expect(r.all()).toHaveLength(2);
    expect(r.forPlugin('@shopverse/foo')).toHaveLength(1);
    expect(r.forPlugin('@shopverse/bar')).toHaveLength(1);
  });

  it('unregisterPlugin removes only its queues', () => {
    r.register('@shopverse/foo', { name: 'a', processor: noopProcessor });
    r.register('@shopverse/foo', { name: 'b', processor: noopProcessor });
    r.register('@shopverse/bar', { name: 'c', processor: noopProcessor });
    r.unregisterPlugin('@shopverse/foo');
    expect(r.all()).toHaveLength(1);
    expect(r.all()[0].pluginId).toBe('@shopverse/bar');
  });
});
