// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { EventBus } from './event-bus.service';
import { EventHandlerRegistry } from './event-handler.registry';

/**
 * Unit tests cover the in-process paths:
 *
 *   1. publish() with no queue (Redis-disabled mode) → falls back to
 *      dispatchSyncForTests → handler runs
 *   2. publish() with a fake queue that throws → same fallback runs
 *   3. publish() with a working queue → job is added; handler does NOT
 *      run in-process (the dispatcher processor on the worker side
 *      handles that — exercised by integration tests)
 *   4. subscribe() and subscribeCustom() route to the right key
 *
 * The processor (event-bus.processor.ts) is exercised via the
 * BullMQ test infrastructure in integration tests, not here.
 */

class FakeQueue {
  added: Array<{ name: string; data: unknown }> = [];
  failNext = false;

  add(name: string, data: unknown): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('redis unreachable'));
    }
    this.added.push({ name, data });
    return Promise.resolve();
  }
}

describe('EventBus', () => {
  let registry: EventHandlerRegistry;
  let queue: FakeQueue | null;
  let bus: EventBus;
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    registry = new EventHandlerRegistry();
    queue = new FakeQueue();
    bus = new EventBus(registry, queue as unknown as never);
    // Default test posture: pretend REDIS_URL is set so the queue path
    // is taken. Individual tests can override via process.env.REDIS_URL
    // when they want the in-process fallback specifically.
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  afterEach(() => {
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedisUrl;
  });

  describe('Redis-disabled fallback', () => {
    beforeEach(() => {
      // Force the in-process path by clearing REDIS_URL for these specs.
      delete process.env.REDIS_URL;
    });

    it('publish() runs in-process when REDIS_URL is unset (queue null)', async () => {
      bus = new EventBus(registry, null);
      const calls: unknown[] = [];
      registry.register('order.placed', 'kernel', (p) => {
        calls.push(p);
        return Promise.resolve();
      });

      await bus.publish('order.placed', {
        orderId: 1,
        userId: 2,
        total: 100,
      } as never);

      // EventBus folds the SDK envelope (name/version/occurredAt) onto
      // the caller's payload, so handlers see them alongside the
      // domain fields.
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        name: 'order.placed',
        version: 1,
        orderId: 1,
        userId: 2,
        total: 100,
      });
    });

    it('publish() falls back to in-process dispatch when queue throws', async () => {
      queue!.failNext = true;
      const calls: unknown[] = [];
      registry.register('payment.refunded', 'kernel', (p) => {
        calls.push(p);
        return Promise.resolve();
      });

      await bus.publish('payment.refunded', {
        paymentId: 'pi_1',
        orderId: 7,
        refundedAmount: 50,
      } as never);

      expect(calls).toHaveLength(1);
    });
  });

  describe('happy path with queue', () => {
    it('publish() enqueues a typed envelope', async () => {
      await bus.publish('order.cancelled', {
        orderId: 42,
        userId: 1,
        reason: 'user-cancel',
      } as never);

      expect(queue!.added).toHaveLength(1);
      const job = queue!.added[0];
      expect(job.name).toBe('order.cancelled');
      const envelope = job.data as {
        event: string;
        payload: unknown;
        occurredAt: string;
      };
      expect(envelope.event).toBe('order.cancelled');
      expect(envelope.payload).toMatchObject({
        name: 'order.cancelled',
        version: 1,
        orderId: 42,
        userId: 1,
        reason: 'user-cancel',
      });
      expect(typeof envelope.occurredAt).toBe('string');
    });

    it('publishCustom() enqueues the topic verbatim', async () => {
      await bus.publishCustom('@shopverse/plugin-foo.thing-happened', {
        x: 1,
      });
      expect(queue!.added[0].name).toBe('@shopverse/plugin-foo.thing-happened');
    });

    it('does NOT invoke local handlers when queue accepts the job', async () => {
      const handler = jest.fn();
      registry.register('order.placed', 'kernel', handler as never);
      await bus.publish('order.placed', { orderId: 1 } as never);
      // Handler runs on the worker process via the dispatcher
      // processor — not in the publisher's process.
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('subscribe / subscribeCustom', () => {
    it('subscribe() registers under the typed event name', () => {
      const fn = () => Promise.resolve();
      bus.subscribe('cart.abandoned', 'kernel', fn as never);
      expect(registry.handlersFor('cart.abandoned')).toHaveLength(1);
    });

    it('subscribeCustom() registers under the literal topic', () => {
      bus.subscribeCustom('@p/foo.bar', '@p/foo', () => Promise.resolve());
      expect(registry.handlersFor('@p/foo.bar')).toHaveLength(1);
    });

    it('multiple subscribers on one event coexist', () => {
      bus.subscribe('order.placed', 'mailer', () => Promise.resolve());
      bus.subscribe('order.placed', 'wallet', () => Promise.resolve());
      bus.subscribe('order.placed', 'loyalty', () => Promise.resolve());
      expect(registry.handlersFor('order.placed')).toHaveLength(3);
    });
  });

  describe('dispatchSyncForTests', () => {
    it('runs handlers in registration order', async () => {
      const order: string[] = [];
      registry.register('order.placed', 'a', () => {
        order.push('a');
        return Promise.resolve();
      });
      registry.register('order.placed', 'b', () => {
        order.push('b');
        return Promise.resolve();
      });
      registry.register('order.placed', 'c', () => {
        order.push('c');
        return Promise.resolve();
      });
      await bus.dispatchSyncForTests('order.placed', {});
      expect(order).toEqual(['a', 'b', 'c']);
    });

    it('a thrown handler stops the chain (BullMQ DLQ semantics)', async () => {
      registry.register('order.placed', 'good', () => Promise.resolve());
      registry.register('order.placed', 'bad', () =>
        Promise.reject(new Error('boom')),
      );
      const downstream = jest.fn();
      registry.register('order.placed', 'downstream', downstream as never);

      await expect(
        bus.dispatchSyncForTests('order.placed', {}),
      ).rejects.toThrow('boom');
      expect(downstream).not.toHaveBeenCalled();
    });
  });
});
