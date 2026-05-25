// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { AsyncLocalStorage } from 'node:async_hooks';
import { trace } from '@opentelemetry/api';

/**
 * Plugin execution context (plan §6 + §10 E15).
 *
 * Establishes a per-call context that downstream observability hooks
 * use to attribute spans, errors, and metrics back to the plugin that
 * caused them. Two consumers today:
 *
 *   1. OTel — sets the active span's `plugin.id` attribute. Slow-path
 *      investigations can filter spans by plugin.
 *   2. Sentry — reads `currentPluginId()` in `beforeSend` and tags the
 *      event with `plugin: <id>`, then applies the per-plugin sample
 *      rate (E15). Errors thrown inside `runInPluginContext` are
 *      attributed correctly even after async/await suspension.
 *
 * The context is AsyncLocalStorage-based so it survives async/await,
 * Promise chains, Prisma callbacks, and BullMQ workers within the
 * same Node process. It does NOT survive an outbound HTTP boundary
 * — propagation across services would require OTel baggage plus
 * Sentry trace context, which is out of scope for v1.
 *
 * Cost: ALS lookup is ~30ns. Each `runInPluginContext` adds one
 * ALS frame; the HookRunner pays this on every handler invocation,
 * not on the zero-handler fast path (plan §5).
 */

interface PluginFrame {
  readonly pluginId: string;
  /** Plan §5 rule #5: max Prisma queries per sync hook invocation. */
  readonly queryBudget: number;
  /** Mutable — incremented by the Prisma middleware on every query. */
  queryCount: number;
}

const pluginAls = new AsyncLocalStorage<PluginFrame>();

/**
 * Run `fn` inside a plugin attribution context. The current OTel span
 * (if any) is tagged with `plugin.id`; Sentry's `beforeSend` reads the
 * ALS to tag events. Works for both sync and async `fn` because the
 * ALS frame survives async boundaries.
 *
 * `queryBudget` is the maximum number of Prisma queries the wrapped
 * code is allowed to issue. Default `Infinity` (no budget — used when
 * the plugin is doing async/event work outside the request hot path).
 * HookRunner uses `1` per plan §5 rule #5 (sync hooks: 1 query max).
 */
export function runInPluginContext<T>(
  pluginId: string,
  fn: () => T,
  queryBudget: number = Number.POSITIVE_INFINITY,
): T {
  return pluginAls.run({ pluginId, queryBudget, queryCount: 0 }, () => {
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttribute('plugin.id', pluginId);
    }
    return fn();
  });
}

/** Returns the current plugin id or null. */
export function currentPluginId(): string | null {
  return pluginAls.getStore()?.pluginId ?? null;
}

/**
 * Record one Prisma query for the active plugin frame. Returns silently
 * if no frame (the query is kernel-originated, not plugin-originated).
 * Throws `PluginQueryBudgetExceededError` when the frame's budget is
 * blown — caller (Prisma middleware) lets the throw propagate so the
 * offending plugin code receives it.
 */
export function recordPluginQuery(): void {
  const frame = pluginAls.getStore();
  if (!frame) return;
  frame.queryCount += 1;
  if (frame.queryCount > frame.queryBudget) {
    throw new PluginQueryBudgetExceededError(
      frame.pluginId,
      frame.queryBudget,
      frame.queryCount,
    );
  }
}

export class PluginQueryBudgetExceededError extends Error {
  constructor(
    public readonly pluginId: string,
    public readonly budget: number,
    public readonly count: number,
  ) {
    super(
      `Plugin "${pluginId}" exceeded its query budget (${count} > ${budget}). ` +
        `Plan §5 rule #5: sync hooks may issue at most one Prisma query per ` +
        `invocation. Move heavy work to an async event consumer.`,
    );
    this.name = 'PluginQueryBudgetExceededError';
  }
}

// ─── Per-plugin Sentry sample rate (E15) ────────────────────────────────────

const pluginSentryRates = new Map<string, number>();

/** Register a plugin's Sentry sample rate (from manifest config.sentry.sampleRate). */
export function setPluginSentryRate(pluginId: string, rate: number): void {
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new Error(`Sentry sample rate for "${pluginId}" must be in [0, 1], got ${rate}`);
  }
  pluginSentryRates.set(pluginId, rate);
}

/** Returns the configured rate or 1.0 (sample everything by default). */
export function getPluginSentryRate(pluginId: string): number {
  return pluginSentryRates.get(pluginId) ?? 1.0;
}

/**
 * Probability check used by `beforeSend` in sentry.ts. Returns true
 * when the event should be sent. Pure math, no I/O.
 */
export function shouldSendPluginEvent(
  pluginId: string,
  rng: () => number = Math.random,
): boolean {
  const rate = getPluginSentryRate(pluginId);
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  return rng() < rate;
}

/** Test helper — clear all configured rates. */
export function _resetPluginContextForTests(): void {
  pluginSentryRates.clear();
}
