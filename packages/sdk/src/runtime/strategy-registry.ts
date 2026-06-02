// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * StrategyRegistry — plan §10 E21.
 *
 * Holds plugin-registered strategy implementations and enforces the
 * three composition modes:
 *
 *   single      one wins per type; first registration claims it.
 *               Re-registration by the same plugin REPLACES; by another
 *               plugin THROWS. Used by PaymentGateway, ShippingCarrier,
 *               InvoiceFormat.
 *
 *   composable  every registration is kept; callers iterate all of them.
 *               Order is registration order. Used by FraudSignal,
 *               EarnRule.
 *
 *   chained     every registration is kept; callers iterate in
 *               priority order (lower first). Used by DiscountStrategy.
 *
 * The registry does NOT compose results — that's the kernel's job (sum
 * scores for fraud, apply in chain for discounts). The registry only
 * enforces shape and exposes lookup.
 *
 * Mode is declared by the strategy's `meta.mode` field. If the value
 * disagrees with the registry's expected mode for that type, registration
 * throws — protecting against contract drift.
 */

import type {
  StrategyType,
  StrategyTypeMap,
  StrategyMode,
} from '../contracts/strategies';

const EXPECTED_MODE: Readonly<Record<StrategyType, StrategyMode>> = {
  PaymentGatewayStrategy: 'single',
  FraudSignalStrategy: 'composable',
  DiscountStrategy: 'chained',
  ShippingCarrierStrategy: 'single',
  EarnRuleStrategy: 'composable',
  InvoiceFormatStrategy: 'single',
};

export class StrategyConflictError extends Error {
  constructor(
    public readonly type: StrategyType,
    public readonly existingPlugin: string,
    public readonly newPlugin: string,
  ) {
    super(
      `Strategy "${type}" is already registered by plugin "${existingPlugin}"; ` +
        `cannot register from "${newPlugin}". ` +
        `Single-mode strategies allow only one impl unless re-registered by the same plugin.`,
    );
    this.name = 'StrategyConflictError';
  }
}

export class StrategyModeMismatchError extends Error {
  constructor(
    public readonly type: StrategyType,
    public readonly declaredMode: StrategyMode,
    public readonly expectedMode: StrategyMode,
  ) {
    super(
      `Strategy "${type}" was registered with mode "${declaredMode}" ` +
        `but the kernel expects mode "${expectedMode}". ` +
        `Check the strategy's meta.mode field.`,
    );
    this.name = 'StrategyModeMismatchError';
  }
}

interface Registration<T extends StrategyType> {
  readonly pluginId: string;
  readonly impl: StrategyTypeMap[T];
}

export class StrategyRegistry {
  private readonly byType = new Map<StrategyType, Registration<StrategyType>[]>();

  /**
   * Register a strategy implementation. Throws on mode mismatch, or on
   * single-mode conflict from a different plugin.
   */
  register<T extends StrategyType>(
    type: T,
    pluginId: string,
    impl: StrategyTypeMap[T],
  ): void {
    const expected = EXPECTED_MODE[type];
    const declared = (impl as { meta: { mode: StrategyMode } }).meta.mode;
    if (declared !== expected) {
      throw new StrategyModeMismatchError(type, declared, expected);
    }

    const list = this.byType.get(type) ?? [];

    if (expected === 'single') {
      const existing = list[0];
      if (existing && existing.pluginId !== pluginId) {
        throw new StrategyConflictError(type, existing.pluginId, pluginId);
      }
      // Same plugin re-registering — replace.
      this.byType.set(type, [{ pluginId, impl: impl as StrategyTypeMap[StrategyType] }]);
      return;
    }

    // composable + chained: append (unique by plugin to allow replace).
    const existingIdx = list.findIndex((r) => r.pluginId === pluginId);
    const entry: Registration<StrategyType> = {
      pluginId,
      impl: impl as StrategyTypeMap[StrategyType],
    };
    if (existingIdx >= 0) {
      list[existingIdx] = entry;
    } else {
      list.push(entry);
    }
    this.byType.set(type, list);
  }

  /**
   * Lookup. Caller chooses the right method for the mode — the registry
   * does NOT collapse single-mode results to a single value because a
   * caller might want to know which plugin owns it for telemetry.
   */

  /** Returns the single-mode impl or null if none registered. */
  getSingle<T extends StrategyType>(type: T): StrategyTypeMap[T] | null {
    if (EXPECTED_MODE[type] !== 'single') {
      throw new Error(`Strategy "${type}" is not single-mode; use list() instead`);
    }
    const list = this.byType.get(type);
    return (list?.[0]?.impl as StrategyTypeMap[T] | undefined) ?? null;
  }

  /** Composable: all impls in registration order. */
  listComposable<T extends StrategyType>(type: T): readonly StrategyTypeMap[T][] {
    if (EXPECTED_MODE[type] !== 'composable') {
      throw new Error(`Strategy "${type}" is not composable; use getSingle() or listChained()`);
    }
    const list = this.byType.get(type) ?? [];
    return list.map((r) => r.impl as StrategyTypeMap[T]);
  }

  /** Chained: impls sorted by priority ascending (lower runs first). */
  listChained<T extends StrategyType>(type: T): readonly StrategyTypeMap[T][] {
    if (EXPECTED_MODE[type] !== 'chained') {
      throw new Error(`Strategy "${type}" is not chained; use getSingle() or listComposable()`);
    }
    const list = this.byType.get(type) ?? [];
    return [...list]
      .sort((a, b) => {
        const pa = (a.impl as { meta: { priority?: number } }).meta.priority ?? 0;
        const pb = (b.impl as { meta: { priority?: number } }).meta.priority ?? 0;
        return pa - pb;
      })
      .map((r) => r.impl as StrategyTypeMap[T]);
  }

  /** Inspection: which plugin owns this type's single impl? */
  ownerOf<T extends StrategyType>(type: T): string | null {
    return this.byType.get(type)?.[0]?.pluginId ?? null;
  }

  /** Inspection: count of impls for this type. */
  count<T extends StrategyType>(type: T): number {
    return this.byType.get(type)?.length ?? 0;
  }

  /** Remove every registration from a plugin (used when plugin is disabled / unloaded). */
  unregisterPlugin(pluginId: string): void {
    for (const [type, list] of this.byType) {
      const filtered = list.filter((r) => r.pluginId !== pluginId);
      if (filtered.length === 0) this.byType.delete(type);
      else this.byType.set(type, filtered);
    }
  }
}
