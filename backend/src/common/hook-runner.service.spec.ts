// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { HookRunner } from './hook-runner.service';
import type { OrderPreValidateContext, RejectReason } from '@shopverse/sdk';

/**
 * Tests focus on the load-bearing properties identified in the plan:
 *   1. No-op fast path (empty registry returns synchronous-ish result)
 *   2. Sequential invocation in registration order
 *   3. Short-circuit on first rejection
 *   4. Timeout → failure → breaker
 *   5. Throw → failure → breaker
 *   6. Operator-disable kill switch
 *   7. RejectReason ≠ failure (breaker NOT incremented)
 *   8. unregisterPlugin removes all of the plugin's handlers
 */

// Minimal valid context for OrderPreValidateContext.
const CTX: OrderPreValidateContext = {
  userId: 1,
  cart: { id: 1, userId: 1, items: [], subtotal: 0 },
  address: {
    id: 1,
    fullName: 'Test',
    line1: '1 St',
    line2: null,
    city: 'Mumbai',
    state: 'MH',
    pincode: '400001',
    country: 'IN',
  },
  warehouseContext: { primaryWarehouseId: 1, availableWarehouseIds: [1] },
  couponCode: null,
  walletAmountUsed: 0,
};

describe('HookRunner', () => {
  let runner: HookRunner;

  beforeEach(() => {
    runner = new HookRunner();
  });

  describe('no-op fast path', () => {
    it('returns empty result when no handlers registered', async () => {
      const result = await runner.runSync('order.preValidate', CTX);
      expect(result.rejected).toBe(false);
      expect(result.rejectReason).toBeNull();
      expect(result.outcomes).toHaveLength(0);
    });

    it('returns the SAME singleton on every call (no per-call allocation)', async () => {
      const r1 = await runner.runSync('order.preValidate', CTX);
      const r2 = await runner.runSync('order.preValidate', CTX);
      expect(r1).toBe(r2); // referential equality — frozen singleton
    });
  });

  describe('registration', () => {
    it('counts registered handlers', () => {
      runner.register('order.preValidate', '@a', () => Promise.resolve());
      runner.register('order.preValidate', '@b', () => Promise.resolve());
      expect(runner.handlerCount('order.preValidate')).toBe(2);
    });

    it('replaces (plugin, hook) re-registration', () => {
      runner.register('order.preValidate', '@a', () => Promise.resolve());
      runner.register('order.preValidate', '@a', () => Promise.resolve());
      expect(runner.handlerCount('order.preValidate')).toBe(1);
    });

    it('unregisterPlugin removes all handlers from that plugin', () => {
      runner.register('order.preValidate', '@a', () => Promise.resolve());
      runner.register('cart.beforeReserve', '@a', () => Promise.resolve());
      runner.register('order.preValidate', '@b', () => Promise.resolve());
      runner.unregisterPlugin('@a');
      expect(runner.handlerCount('order.preValidate')).toBe(1);
      expect(runner.handlerCount('cart.beforeReserve')).toBe(0);
    });
  });

  describe('sequential invocation', () => {
    it('invokes handlers in registration order', async () => {
      const order: string[] = [];
      runner.register('order.preValidate', '@a', () => {
        order.push('a');
        return Promise.resolve();
      });
      runner.register('order.preValidate', '@b', () => {
        order.push('b');
        return Promise.resolve();
      });
      runner.register('order.preValidate', '@c', () => {
        order.push('c');
        return Promise.resolve();
      });
      await runner.runSync('order.preValidate', CTX);
      expect(order).toEqual(['a', 'b', 'c']);
    });
  });

  describe('rejection short-circuit', () => {
    it('stops at first rejection', async () => {
      const order: string[] = [];
      runner.register('order.preValidate', '@a', () => {
        order.push('a');
        return Promise.resolve();
      });
      runner.register('order.preValidate', '@b', (): Promise<RejectReason> => {
        order.push('b');
        return Promise.resolve({ reject: true, code: 'FAIL', message: 'no' });
      });
      runner.register('order.preValidate', '@c', () => {
        order.push('c');
        return Promise.resolve();
      });
      const result = await runner.runSync('order.preValidate', CTX);
      expect(order).toEqual(['a', 'b']);
      expect(result.rejected).toBe(true);
      expect(result.rejectReason?.code).toBe('FAIL');
    });
  });

  describe('failure → breaker', () => {
    it('opens breaker after 5 thrown errors and skips subsequent calls', async () => {
      const handler = jest.fn(() => Promise.reject(new Error('boom')));
      runner.register('order.preValidate', '@bad', handler);
      // Fire 5 invocations — last one OPENS the breaker
      for (let i = 0; i < 5; i++) {
        await runner.runSync('order.preValidate', CTX);
      }
      expect(handler).toHaveBeenCalledTimes(5);
      // 6th call should NOT invoke the handler.
      const result = await runner.runSync('order.preValidate', CTX);
      expect(handler).toHaveBeenCalledTimes(5);
      expect(result.outcomes[0].status).toBe('breaker-open');
    });

    it('rejection does NOT count toward the breaker', async () => {
      runner.register(
        'order.preValidate',
        '@reject-only',
        (): Promise<RejectReason> =>
          Promise.resolve({
            reject: true,
            code: 'X',
            message: 'nope',
          }),
      );
      // Fire 10 invocations — breaker should stay closed.
      for (let i = 0; i < 10; i++) {
        const result = await runner.runSync('order.preValidate', CTX);
        expect(result.outcomes[0].status).toBe('rejected');
      }
      // 11th still invokes the handler.
      const result = await runner.runSync('order.preValidate', CTX);
      expect(result.outcomes[0].status).toBe('rejected');
    });
  });

  describe('timeout', () => {
    it('treats budget exceedance as failure', async () => {
      // 'order.afterPlace' budget is 50ms.
      runner.register('order.afterPlace', '@slow', async () => {
        await new Promise((r) => setTimeout(r, 200));
      });
      const result = await runner.runSync('order.afterPlace', {
        order: {
          id: 1,
          userId: 1,
          guestEmail: null,
          subtotal: 0,
          discountAmount: 0,
          shippingFee: 0,
          taxAmount: 0,
          total: 0,
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          items: [],
        },
        warehouseContext: { primaryWarehouseId: 1, availableWarehouseIds: [1] },
      });
      expect(result.outcomes[0].status).toBe('timeout');
    }, 10_000);
  });

  describe('operator disable', () => {
    it('skips a disabled plugin without invoking the handler', async () => {
      const handler = jest.fn(() => Promise.resolve());
      runner.register('order.preValidate', '@kill-me', handler);
      runner.disablePlugin('@kill-me');
      const result = await runner.runSync('order.preValidate', CTX);
      expect(handler).not.toHaveBeenCalled();
      expect(result.outcomes[0].status).toBe('breaker-open');
    });

    it('re-enabling restores invocation', async () => {
      const handler = jest.fn(() => Promise.resolve());
      runner.register('order.preValidate', '@toggle', handler);
      runner.disablePlugin('@toggle');
      await runner.runSync('order.preValidate', CTX);
      expect(handler).not.toHaveBeenCalled();
      runner.enablePlugin('@toggle');
      await runner.runSync('order.preValidate', CTX);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('outcome reporting', () => {
    it('produces one outcome per invoked handler', async () => {
      runner.register('order.preValidate', '@a', () => Promise.resolve());
      runner.register('order.preValidate', '@b', () => Promise.resolve());
      const result = await runner.runSync('order.preValidate', CTX);
      expect(result.outcomes).toHaveLength(2);
      expect(result.outcomes[0].pluginId).toBe('@a');
      expect(result.outcomes[1].pluginId).toBe('@b');
      expect(result.outcomes[0].status).toBe('ok');
      expect(result.outcomes[1].status).toBe('ok');
    });
  });
});
