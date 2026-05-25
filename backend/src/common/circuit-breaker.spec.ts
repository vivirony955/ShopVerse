// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { CircuitBreaker } from './circuit-breaker';

/**
 * Controlled clock: lets tests advance time deterministically rather
 * than relying on Jest fake timers (which interact poorly with
 * Promise scheduling).
 */
class FakeClock {
  private t = 0;
  now = (): number => this.t;
  advance(ms: number): void {
    this.t += ms;
  }
}

describe('CircuitBreaker', () => {
  let clock: FakeClock;

  beforeEach(() => {
    clock = new FakeClock();
  });

  describe('initial state', () => {
    it('starts closed', () => {
      const cb = new CircuitBreaker({ now: clock.now });
      expect(cb.state).toBe('closed');
      expect(cb.tryAcquire()).toBe(true);
    });
  });

  describe('closed → open transition', () => {
    it('opens after N consecutive failures within window', () => {
      const cb = new CircuitBreaker({
        failureThreshold: 3,
        windowMs: 60_000,
        cooldownMs: 60_000,
        now: clock.now,
      });
      cb.recordFailure();
      expect(cb.state).toBe('closed');
      cb.recordFailure();
      expect(cb.state).toBe('closed');
      cb.recordFailure();
      expect(cb.state).toBe('open');
      expect(cb.tryAcquire()).toBe(false);
    });

    it('resets the failure window when no failure for windowMs', () => {
      const cb = new CircuitBreaker({
        failureThreshold: 3,
        windowMs: 1_000,
        cooldownMs: 60_000,
        now: clock.now,
      });
      cb.recordFailure();
      cb.recordFailure();
      clock.advance(1_001); // window expired
      cb.recordFailure(); // counts as 1, not 3
      expect(cb.state).toBe('closed');
    });

    it('success in closed state resets the failure counter', () => {
      const cb = new CircuitBreaker({
        failureThreshold: 3,
        now: clock.now,
      });
      cb.recordFailure();
      cb.recordFailure();
      cb.recordSuccess();
      cb.recordFailure(); // would be 3rd cumulative; counter reset → still 1
      expect(cb.state).toBe('closed');
    });
  });

  describe('open → half-open transition', () => {
    it('transitions to half-open after cooldownMs', () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        cooldownMs: 5_000,
        now: clock.now,
      });
      cb.recordFailure();
      expect(cb.state).toBe('open');
      clock.advance(4_999);
      expect(cb.state).toBe('open');
      clock.advance(1);
      expect(cb.state).toBe('half-open');
      expect(cb.tryAcquire()).toBe(true);
    });
  });

  describe('half-open → closed (trial success)', () => {
    it('closes on trial success', () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        cooldownMs: 1_000,
        now: clock.now,
      });
      cb.recordFailure();
      clock.advance(1_000);
      expect(cb.state).toBe('half-open');
      cb.recordSuccess();
      expect(cb.state).toBe('closed');
    });
  });

  describe('half-open → open (trial failure)', () => {
    it('reopens on trial failure with fresh cooldown', () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        cooldownMs: 1_000,
        now: clock.now,
      });
      cb.recordFailure();
      clock.advance(1_000);
      expect(cb.state).toBe('half-open');
      cb.recordFailure();
      expect(cb.state).toBe('open');
      // Cooldown restarts.
      clock.advance(999);
      expect(cb.state).toBe('open');
      clock.advance(1);
      expect(cb.state).toBe('half-open');
    });
  });

  describe('manual controls', () => {
    it('reset() clears all state', () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        now: clock.now,
      });
      cb.recordFailure();
      expect(cb.state).toBe('open');
      cb.reset();
      expect(cb.state).toBe('closed');
      expect(cb.tryAcquire()).toBe(true);
    });

    it('forceOpen() opens regardless of failure count', () => {
      const cb = new CircuitBreaker({ now: clock.now });
      cb.forceOpen();
      expect(cb.state).toBe('open');
      expect(cb.tryAcquire()).toBe(false);
    });
  });
});
