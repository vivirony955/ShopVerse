// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Injectable } from '@nestjs/common';
import type { HookOutcome } from './hook-runner.service';

/**
 * PluginMetricsService — Task 6 / POST_W6 §4.4 metrics-bridge.
 *
 * In-process rolling stats per plugin. Single-tenant v1 means no
 * scatter-gather; this lives next to HookRunner and EventBus in the
 * same process. Read by `GET /admin/plugins/runtime-metrics`.
 *
 * Bounds (plan edge cases):
 *   - 5-minute sliding window per plugin (lastFailure + p95 derived
 *     only from entries within the window).
 *   - 200 hard-cap entries per plugin (prevents unbounded growth on a
 *     plugin that fires very rapidly; oldest entries get evicted).
 *   - 24-hour reasoning: at 200 entries × 5 min, sustained traffic
 *     of ~40 calls / min keeps the window full; bursts above that
 *     get summarized with the freshest 200 entries.
 *
 * No PII in stored data — only `durationMs`, `failed` boolean,
 * timestamp. Per-plugin keys are plugin IDs (already in audit logs).
 *
 * Test isolation: `reset()` clears all stats. Tests that exercise
 * the service should call it in beforeEach to keep state fresh.
 */

const WINDOW_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 200;

interface Entry {
  readonly ts: number;
  readonly durationMs: number;
  readonly failed: boolean;
}

class RollingStats {
  private readonly buffer: Entry[] = [];

  record(durationMs: number, failed: boolean, now = Date.now()): void {
    this.buffer.push({ ts: now, durationMs, failed });
    // Evict oldest if over hard cap. Cheap O(1) shift on small arrays.
    if (this.buffer.length > MAX_ENTRIES) this.buffer.shift();
  }

  /**
   * Drop entries older than the window. Called lazily by readers
   * to avoid timer/interval setup just for pruning.
   */
  private prune(now: number): void {
    const cutoff = now - WINDOW_MS;
    while (this.buffer.length && this.buffer[0].ts < cutoff) {
      this.buffer.shift();
    }
  }

  p95(now = Date.now()): number | null {
    this.prune(now);
    if (this.buffer.length === 0) return null;
    const sorted = this.buffer.map((e) => e.durationMs).sort((a, b) => a - b);
    const idx = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);
    return sorted[idx];
  }

  lastFailureMs(now = Date.now()): number | null {
    this.prune(now);
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      if (this.buffer[i].failed) return this.buffer[i].ts;
    }
    return null;
  }

  size(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer.length = 0;
  }
}

export interface PluginRuntimeStats {
  /** p95 of hook handler duration over the last 5 minutes, in ms. */
  readonly hookP95Ms: number | null;
  /** p95 of event consumer duration over the last 5 minutes, in ms.
   * v1 always null — EventBus integration is a follow-on. */
  readonly eventP95Ms: number | null;
  /** Timestamp (ms since epoch) of the most recent failure within
   * the window, or null if no failure in window. */
  readonly lastFailureMs: number | null;
}

@Injectable()
export class PluginMetricsService {
  private readonly hookStats = new Map<string, RollingStats>();

  /**
   * Called by HookRunner after each handler completes. Cheap path —
   * 1 Map lookup + 1 array push + 1 conditional shift. No promises.
   */
  recordHookOutcome(pluginId: string, outcome: HookOutcome): void {
    let stats = this.hookStats.get(pluginId);
    if (!stats) {
      stats = new RollingStats();
      this.hookStats.set(pluginId, stats);
    }
    const failed =
      outcome.status === 'failed' || outcome.status === 'timeout';
    stats.record(outcome.durationMs, failed);
  }

  /**
   * Read aggregate stats for one plugin. Returns null fields when no
   * data — frontend renders these as "—", NOT zero (zero is a real
   * measurement of "instant return"; null is "never measured").
   */
  getRuntimeStats(pluginId: string): PluginRuntimeStats {
    const stats = this.hookStats.get(pluginId);
    if (!stats) {
      return { hookP95Ms: null, eventP95Ms: null, lastFailureMs: null };
    }
    return {
      hookP95Ms: stats.p95(),
      eventP95Ms: null,
      lastFailureMs: stats.lastFailureMs(),
    };
  }

  /**
   * Test isolation helper. Clears all per-plugin buffers.
   */
  reset(): void {
    this.hookStats.clear();
  }

  /** Inspection helper — size of buffer for one plugin (for tests). */
  bufferSize(pluginId: string): number {
    return this.hookStats.get(pluginId)?.size() ?? 0;
  }
}
