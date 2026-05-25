// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * Semaphore (plan §10 E7).
 *
 * Backs the per-plugin DB concurrency cap. A plugin's SDK-wrapped Prisma
 * client routes every query through `Semaphore.run()` so at most N
 * queries are in flight per plugin globally. Excess queries queue
 * (FIFO) with an optional acquire timeout.
 *
 * This is pure JS, zero deps, fair (FIFO) — usable from both Node and
 * any future edge runtime.
 */

export interface SemaphoreOptions {
  readonly permits: number; // max concurrent
  /** ms before `acquire()` rejects with SemaphoreTimeoutError. */
  readonly acquireTimeoutMs?: number;
}

export class SemaphoreTimeoutError extends Error {
  constructor(public readonly waitedMs: number) {
    super(`Semaphore acquire timed out after ${waitedMs}ms`);
    this.name = 'SemaphoreTimeoutError';
  }
}

interface Waiter {
  readonly resolve: () => void;
  readonly reject: (err: Error) => void;
  readonly timer: NodeJS.Timeout | null;
}

export class Semaphore {
  private inFlight = 0;
  private readonly waiters: Waiter[] = [];
  private readonly maxPermits: number;
  private readonly timeoutMs: number | null;

  constructor(opts: SemaphoreOptions) {
    if (!Number.isInteger(opts.permits) || opts.permits < 1) {
      throw new Error(`Semaphore permits must be a positive integer, got ${opts.permits}`);
    }
    this.maxPermits = opts.permits;
    this.timeoutMs = opts.acquireTimeoutMs ?? null;
  }

  /** Read-only stats — used by metrics. */
  get permitsAvailable(): number {
    return Math.max(0, this.maxPermits - this.inFlight);
  }

  get queueDepth(): number {
    return this.waiters.length;
  }

  /**
   * Wraps `fn` so it runs only when a permit is available. The permit is
   * released after the promise settles (success or failure).
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.inFlight < this.maxPermits) {
      this.inFlight += 1;
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const started = Date.now();
      let timer: NodeJS.Timeout | null = null;

      const waiter: Waiter = {
        resolve: () => {
          if (timer) clearTimeout(timer);
          resolve();
        },
        reject: (err: Error) => {
          if (timer) clearTimeout(timer);
          reject(err);
        },
        timer: null,
      };

      if (this.timeoutMs !== null) {
        timer = setTimeout(() => {
          const idx = this.waiters.indexOf(waiter);
          if (idx >= 0) this.waiters.splice(idx, 1);
          reject(new SemaphoreTimeoutError(Date.now() - started));
        }, this.timeoutMs);
        if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
          (timer as { unref: () => void }).unref();
        }
      }

      // `timer` is captured in the waiter's resolve/reject closures.
      this.waiters.push(waiter);
    });
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      // Hand the permit directly to the next waiter — `inFlight` stays
      // the same (the permit moves; we don't decrement then increment).
      next.resolve();
    } else {
      this.inFlight = Math.max(0, this.inFlight - 1);
    }
  }
}
