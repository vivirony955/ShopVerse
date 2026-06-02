// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import type {
  DiscountStrategy,
  FraudSignalStrategy,
  PaymentGatewayStrategy,
} from '../contracts/strategies';
import {
  StrategyConflictError,
  StrategyModeMismatchError,
  StrategyRegistry,
} from './strategy-registry';

function payment(id: string): PaymentGatewayStrategy {
  return {
    meta: { id, mode: 'single' },
    webhookPath: `/${id}`,
    createIntent: async () => ({ id: 'pi', clientSecret: 'x', gatewayId: id }),
    handleWebhook: async () => ({ handled: true }),
  };
}

function fraudSignal(id: string): FraudSignalStrategy {
  return {
    meta: { id, mode: 'composable' },
    score: async () => 0,
  };
}

function discount(id: string, priority: number): DiscountStrategy {
  return {
    meta: { id, mode: 'chained', priority },
    apply: async () => null,
  };
}

describe('StrategyRegistry', () => {
  let r: StrategyRegistry;
  beforeEach(() => {
    r = new StrategyRegistry();
  });

  describe('single mode (PaymentGateway)', () => {
    it('stores one impl', () => {
      r.register('PaymentGatewayStrategy', 'p1', payment('stripe'));
      expect(r.getSingle('PaymentGatewayStrategy')?.meta.id).toBe('stripe');
      expect(r.ownerOf('PaymentGatewayStrategy')).toBe('p1');
    });

    it('same plugin re-registers — replaces', () => {
      r.register('PaymentGatewayStrategy', 'p1', payment('stripe'));
      r.register('PaymentGatewayStrategy', 'p1', payment('stripe-v2'));
      expect(r.getSingle('PaymentGatewayStrategy')?.meta.id).toBe('stripe-v2');
    });

    it('different plugin registering same single-type → throws', () => {
      r.register('PaymentGatewayStrategy', 'p1', payment('stripe'));
      expect(() =>
        r.register('PaymentGatewayStrategy', 'p2', payment('razorpay')),
      ).toThrow(StrategyConflictError);
    });

    it('mode mismatch throws', () => {
      const bad = { ...payment('stripe'), meta: { id: 'stripe', mode: 'composable' as const } };
      expect(() =>
        r.register('PaymentGatewayStrategy', 'p1', bad as never),
      ).toThrow(StrategyModeMismatchError);
    });
  });

  describe('composable mode (FraudSignal)', () => {
    it('keeps multiple impls in registration order', () => {
      r.register('FraudSignalStrategy', 'p1', fraudSignal('geo'));
      r.register('FraudSignalStrategy', 'p2', fraudSignal('velocity'));
      const all = r.listComposable('FraudSignalStrategy');
      expect(all).toHaveLength(2);
      expect(all[0].meta.id).toBe('geo');
      expect(all[1].meta.id).toBe('velocity');
    });

    it('same plugin replaces its own impl', () => {
      r.register('FraudSignalStrategy', 'p1', fraudSignal('v1'));
      r.register('FraudSignalStrategy', 'p1', fraudSignal('v2'));
      expect(r.listComposable('FraudSignalStrategy')).toHaveLength(1);
    });

    it('rejects getSingle() on composable type', () => {
      expect(() => r.getSingle('FraudSignalStrategy')).toThrow(/not single-mode/);
    });
  });

  describe('chained mode (Discount)', () => {
    it('returns impls sorted by priority ascending', () => {
      r.register('DiscountStrategy', 'p1', discount('a', 50));
      r.register('DiscountStrategy', 'p2', discount('b', 10));
      r.register('DiscountStrategy', 'p3', discount('c', 30));
      const order = r.listChained('DiscountStrategy').map((d) => d.meta.id);
      expect(order).toEqual(['b', 'c', 'a']);
    });

    it('treats missing priority as 0', () => {
      r.register('DiscountStrategy', 'p1', discount('a', 5));
      r.register('DiscountStrategy', 'p2', {
        ...discount('b', 0),
        meta: { id: 'b', mode: 'chained' },
      });
      const order = r.listChained('DiscountStrategy').map((d) => d.meta.id);
      expect(order).toEqual(['b', 'a']);
    });
  });

  describe('unregisterPlugin', () => {
    it('removes all of a plugin\'s impls', () => {
      r.register('FraudSignalStrategy', 'p1', fraudSignal('v1'));
      r.register('FraudSignalStrategy', 'p2', fraudSignal('v2'));
      r.unregisterPlugin('p1');
      const left = r.listComposable('FraudSignalStrategy');
      expect(left).toHaveLength(1);
      expect(left[0].meta.id).toBe('v2');
    });
  });
});
