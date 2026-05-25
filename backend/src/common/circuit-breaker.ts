// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * CircuitBreaker — plan §6 + §10 E2.
 *
 * Per-plugin, per-hook failure isolation. Closed under normal operation;
 * opens after N consecutive failures within a window; cools down; admits
 * one trial call (half-open) to test recovery; closes on success.
 *
 * State semantics:
 *
 *   closed     normal operation; calls allowed
 *   open       skip all calls; return cached "skip" decision
 *   half-open  admit ONE call; success → closed, failure → open + reset cooldown
 *
 * The breaker is a PURE state machine — it does NOT itself invoke
 * handlers. Callers (HookRunner) consult `tryAcquire()` before calling,
 * then report `recordSuccess()` or `recordFailure()` afterwards.
 *
 * This is intentionally simpler than `opossum`:
 *   - No half-open quota (just 1 trial)
 *   - No volume-threshold sliding-window (consecutive count only)
 *   - No event emitter (caller observes by polling `state` / counters)
 *
 * The simplicity is the point: a hot-path safety net should be auditable
 * by reading 80 lines of code.
 */

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  /** Consecutive failures within `windowMs` to open the breaker. */
  readonly failureThreshold: number;
  /** Sliding window (ms) within which consecutive failures must occur. */
  readonly windowMs: number;
  /** Time (ms) in `open` before transitioning to `half-open`. */
  readonly cooldownMs: number;
  /** Optional clock override for deterministic tests. */
  readonly now?: () => number;
}

export const DEFAULT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  windowMs: 60_000,
  cooldownMs: 60_000,
};

export class CircuitBreaker {
  private _state: CircuitBreakerState = 'closed';
  private failureCount = 0;
  /** Timestamp of the OLDEST failure in the current run. */
  private firstFailureAt = 0;
  /** Timestamp the breaker opened (set when transitioning to `open`). */
  private openedAt = 0;

  private readonly cfg: CircuitBreakerConfig;
  private readonly now: () => number;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.cfg = { ...DEFAULT_BREAKER_CONFIG, ...config };
    this.now = this.cfg.now ?? Date.now;
  }

  get state(): CircuitBreakerState {
    // Lazy transition open → half-open when cooldown elapses.
    if (this._state === 'open' && this.now() - this.openedAt >= this.cfg.cooldownMs) {
      this._state = 'half-open';
    }
    return this._state;
  }

  /**
   * Returns true if a call should proceed.
   * - closed     → true
   * - half-open  → true (one trial)
   * - open       → false
   *
   * Note: callers MUST follow up with `recordSuccess` or `recordFailure`
   * for half-open trials. Otherwise the breaker stays half-open.
   */
  tryAcquire(): boolean {
    return this.state !== 'open';
  }

  recordSuccess(): void {
    if (this._state === 'half-open') {
      // Trial passed — close the breaker.
      this.reset();
      return;
    }
    // In closed state, success resets the failure window.
    this.failureCount = 0;
    this.firstFailureAt = 0;
  }

  recordFailure(): void {
    const t = this.now();

    if (this._state === 'half-open') {
      // Trial failed — reopen + restart cooldown.
      this._state = 'open';
      this.openedAt = t;
      this.failureCount = this.cfg.failureThreshold;
      this.firstFailureAt = t;
      return;
    }

    // closed state — accumulate
    if (this.failureCount === 0 || t - this.firstFailureAt > this.cfg.windowMs) {
      // Start a fresh window.
      this.failureCount = 1;
      this.firstFailureAt = t;
    } else {
      this.failureCount += 1;
    }

    if (this.failureCount >= this.cfg.failureThreshold) {
      this._state = 'open';
      this.openedAt = t;
    }
  }

  /** Force-close (used by `recordSuccess` in half-open + manual reset). */
  reset(): void {
    this._state = 'closed';
    this.failureCount = 0;
    this.firstFailureAt = 0;
    this.openedAt = 0;
  }

  /** Force-open (used by operator-disable kill switch — plan §10 E2). */
  forceOpen(): void {
    this._state = 'open';
    this.openedAt = this.now();
    this.failureCount = this.cfg.failureThreshold;
  }
}
