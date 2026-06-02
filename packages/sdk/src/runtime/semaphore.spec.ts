// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Semaphore, SemaphoreTimeoutError } from './semaphore';

describe('Semaphore', () => {
  it('throws on non-positive permits', () => {
    expect(() => new Semaphore({ permits: 0 })).toThrow();
    expect(() => new Semaphore({ permits: -1 })).toThrow();
    expect(() => new Semaphore({ permits: 1.5 })).toThrow();
  });

  it('runs concurrent tasks up to the permit cap', async () => {
    const sem = new Semaphore({ permits: 2 });
    let inFlight = 0;
    let peak = 0;

    const task = () =>
      sem.run(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 20));
        inFlight -= 1;
      });

    await Promise.all([task(), task(), task(), task(), task()]);
    expect(peak).toBe(2);
  });

  it('queues FIFO when at capacity', async () => {
    const sem = new Semaphore({ permits: 1 });
    const order: number[] = [];
    const release: Array<() => void> = [];

    const task = (id: number) =>
      sem.run(async () => {
        order.push(id);
        await new Promise<void>((resolve) => release.push(resolve));
      });

    const p1 = task(1);
    const p2 = task(2);
    const p3 = task(3);

    // Yield so the first task acquires.
    await new Promise((r) => setImmediate(r));
    expect(order).toEqual([1]);

    release[0]();
    await new Promise((r) => setImmediate(r));
    expect(order).toEqual([1, 2]);

    release[1]();
    await new Promise((r) => setImmediate(r));
    expect(order).toEqual([1, 2, 3]);

    release[2]();
    await Promise.all([p1, p2, p3]);
  });

  it('reports queueDepth + permitsAvailable', async () => {
    const sem = new Semaphore({ permits: 1 });
    const release: Array<() => void> = [];

    const blocking = sem.run(
      () => new Promise<void>((resolve) => release.push(resolve)),
    );
    await new Promise((r) => setImmediate(r));
    expect(sem.permitsAvailable).toBe(0);

    const queued = sem.run(async () => undefined);
    await new Promise((r) => setImmediate(r));
    expect(sem.queueDepth).toBe(1);

    release[0]();
    await blocking;
    await queued;
    expect(sem.queueDepth).toBe(0);
    expect(sem.permitsAvailable).toBe(1);
  });

  it('rejects waiters past acquireTimeoutMs', async () => {
    const sem = new Semaphore({ permits: 1, acquireTimeoutMs: 50 });
    const release: Array<() => void> = [];

    const holding = sem.run(
      () => new Promise<void>((resolve) => release.push(resolve)),
    );

    await expect(sem.run(async () => undefined)).rejects.toBeInstanceOf(
      SemaphoreTimeoutError,
    );

    release[0]();
    await holding;
  });

  it('releases permit on task throw', async () => {
    const sem = new Semaphore({ permits: 1 });

    await expect(
      sem.run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // Permit is now back; another task can run.
    await expect(sem.run(async () => 'ok')).resolves.toBe('ok');
  });
});
