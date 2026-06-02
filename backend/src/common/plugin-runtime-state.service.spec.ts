// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { HookRunner } from './hook-runner.service';
import { PluginRuntimeStateService } from './plugin-runtime-state.service';
import { RedisService } from './redis.service';

/**
 * Stub RedisService backed by an in-memory set. Tests reach into the
 * stub to simulate cross-pod updates between sync() calls.
 */
class FakeRedis {
  enabled = true;
  set = new Set<string>();
  isEnabled() {
    return this.enabled;
  }
  sadd(_key: string, member: string): Promise<void> {
    if (this.enabled) this.set.add(member);
    return Promise.resolve();
  }
  srem(_key: string, member: string): Promise<void> {
    if (this.enabled) this.set.delete(member);
    return Promise.resolve();
  }
  smembers(_key: string): Promise<string[]> {
    return Promise.resolve(this.enabled ? Array.from(this.set) : []);
  }
}

describe('PluginRuntimeStateService', () => {
  let hooks: HookRunner;
  let redis: FakeRedis;
  let svc: PluginRuntimeStateService;

  beforeEach(async () => {
    hooks = new HookRunner();
    redis = new FakeRedis();
    svc = new PluginRuntimeStateService(
      redis as unknown as RedisService,
      hooks,
    );
    // Force test-mode (no polling timer); tests drive sync() explicitly.
    process.env.NODE_ENV = 'test';
    await svc.onModuleInit();
  });

  afterEach(() => {
    svc.onModuleDestroy();
  });

  it('disable() flips HookRunner + writes Redis', async () => {
    await svc.disable('@shopverse/foo', 42);
    expect(svc.isDisabled('@shopverse/foo')).toBe(true);
    expect(hooks.isPluginDisabled('@shopverse/foo')).toBe(true);
    expect(redis.set.has('@shopverse/foo')).toBe(true);
  });

  it('enable() flips HookRunner + removes from Redis', async () => {
    await svc.disable('@shopverse/foo');
    await svc.enable('@shopverse/foo');
    expect(svc.isDisabled('@shopverse/foo')).toBe(false);
    expect(hooks.isPluginDisabled('@shopverse/foo')).toBe(false);
    expect(redis.set.has('@shopverse/foo')).toBe(false);
  });

  it('hydrate() pulls existing entries from Redis on boot', async () => {
    redis.set.add('@shopverse/preset');
    // Re-construct to simulate cold boot.
    const fresh = new PluginRuntimeStateService(
      redis as unknown as RedisService,
      hooks,
    );
    await fresh.hydrate();
    expect(hooks.isPluginDisabled('@shopverse/preset')).toBe(true);
  });

  it('sync() picks up cross-pod additions', async () => {
    // Simulate another pod disabling a plugin.
    redis.set.add('@shopverse/remote');
    expect(hooks.isPluginDisabled('@shopverse/remote')).toBe(false);
    await svc.sync();
    expect(hooks.isPluginDisabled('@shopverse/remote')).toBe(true);
  });

  it('Redis-disabled mode still works in-memory', async () => {
    redis.enabled = false;
    await svc.disable('@shopverse/local');
    expect(svc.isDisabled('@shopverse/local')).toBe(true);
    // Did not write to Redis.
    expect(redis.set.has('@shopverse/local')).toBe(false);
  });

  it('overlapping sync() calls coalesce', async () => {
    redis.set.add('@shopverse/a');
    redis.set.add('@shopverse/b');
    await Promise.all([svc.sync(), svc.sync(), svc.sync()]);
    expect(hooks.isPluginDisabled('@shopverse/a')).toBe(true);
    expect(hooks.isPluginDisabled('@shopverse/b')).toBe(true);
  });
});
