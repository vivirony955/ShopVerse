// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { PluginMetricsService } from './plugin-metrics.service';
import type { HookOutcome } from './hook-runner.service';

describe('PluginMetricsService', () => {
  let svc: PluginMetricsService;

  beforeEach(() => {
    svc = new PluginMetricsService();
  });

  const ok = (durationMs: number): HookOutcome => ({
    pluginId: '@p/x',
    status: 'ok',
    durationMs,
  });
  const failed = (durationMs: number): HookOutcome => ({
    pluginId: '@p/x',
    status: 'failed',
    durationMs,
    error: 'boom',
  });
  const timeout = (durationMs: number): HookOutcome => ({
    pluginId: '@p/x',
    status: 'timeout',
    durationMs,
    error: 'budget',
  });

  it('returns null fields for a plugin that has never been recorded', () => {
    const stats = svc.getRuntimeStats('@p/never');
    expect(stats.hookP95Ms).toBeNull();
    expect(stats.eventP95Ms).toBeNull();
    expect(stats.lastFailureMs).toBeNull();
  });

  it('records hook outcomes and exposes p95 across recorded samples', () => {
    // Mixed distribution; p95 of 100 samples = 95th value (sorted).
    for (let i = 1; i <= 100; i++) svc.recordHookOutcome('@p/x', ok(i));
    const stats = svc.getRuntimeStats('@p/x');
    // Math.floor(100 * 0.95) = 95; sorted array is 1..100 so index 95 = 96.
    expect(stats.hookP95Ms).toBe(96);
    expect(stats.lastFailureMs).toBeNull();
  });

  it('eventP95Ms is always null in v1 (additive surface, no EventBus push)', () => {
    svc.recordHookOutcome('@p/x', ok(42));
    expect(svc.getRuntimeStats('@p/x').eventP95Ms).toBeNull();
  });

  it('counts both failed and timeout statuses as failures (lastFailureMs surfaces them)', () => {
    svc.recordHookOutcome('@p/x', ok(5));
    svc.recordHookOutcome('@p/x', failed(10));
    expect(svc.getRuntimeStats('@p/x').lastFailureMs).not.toBeNull();

    const svc2 = new PluginMetricsService();
    svc2.recordHookOutcome('@p/x', ok(5));
    svc2.recordHookOutcome('@p/x', timeout(10));
    expect(svc2.getRuntimeStats('@p/x').lastFailureMs).not.toBeNull();
  });

  it('caps the buffer at MAX_ENTRIES (200) — bounded growth on a chatty plugin', () => {
    for (let i = 0; i < 1000; i++) svc.recordHookOutcome('@p/x', ok(i));
    expect(svc.bufferSize('@p/x')).toBe(200);
    // p95 is still derived from the 200 most-recent entries.
    const stats = svc.getRuntimeStats('@p/x');
    expect(stats.hookP95Ms).not.toBeNull();
  });

  it('reset() clears all plugin buffers — test isolation guard', () => {
    svc.recordHookOutcome('@p/a', ok(1));
    svc.recordHookOutcome('@p/b', ok(2));
    expect(svc.bufferSize('@p/a')).toBe(1);
    expect(svc.bufferSize('@p/b')).toBe(1);
    svc.reset();
    expect(svc.bufferSize('@p/a')).toBe(0);
    expect(svc.bufferSize('@p/b')).toBe(0);
    expect(svc.getRuntimeStats('@p/a').hookP95Ms).toBeNull();
  });

  it('per-plugin isolation — recording for plugin A does not affect plugin B', () => {
    svc.recordHookOutcome('@p/a', failed(50));
    svc.recordHookOutcome('@p/b', ok(5));
    expect(svc.getRuntimeStats('@p/a').lastFailureMs).not.toBeNull();
    expect(svc.getRuntimeStats('@p/b').lastFailureMs).toBeNull();
    expect(svc.getRuntimeStats('@p/a').hookP95Ms).toBe(50);
    expect(svc.getRuntimeStats('@p/b').hookP95Ms).toBe(5);
  });

  it('p95 reflects only entries within the 5-minute window — older entries prune lazily', () => {
    jest.useFakeTimers();
    try {
      const t0 = new Date('2026-05-31T10:00:00Z').getTime();
      jest.setSystemTime(t0);

      // Old samples — will be pruned by the 5-minute window.
      svc.recordHookOutcome('@p/x', ok(1000));
      svc.recordHookOutcome('@p/x', ok(1000));

      // Advance 6 minutes — past the 5-min window.
      jest.setSystemTime(t0 + 6 * 60_000);

      // Fresh samples in the new window.
      svc.recordHookOutcome('@p/x', ok(10));
      svc.recordHookOutcome('@p/x', ok(20));

      const stats = svc.getRuntimeStats('@p/x');
      // p95 from {10, 20} is 20 — old 1000ms samples must be pruned.
      // If they leaked through, p95 would be 1000.
      expect(stats.hookP95Ms).toBe(20);
    } finally {
      jest.useRealTimers();
    }
  });
});
