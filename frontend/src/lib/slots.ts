// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * ShopVerse frontend slot system (W5.T1).
 *
 * Slots are compile-time extension points where first-party plugins
 * register React components. The kernel pages emit `<Slot name="..." />`
 * at the locations listed below; the build-time codegen target
 * `frontend/src/generated/slot-registrations.ts` is populated from
 * `plugins.config.ts` and loaded eagerly at module-init.
 *
 * No runtime dynamic imports, no SSR fetches inside slot components —
 * see plan §4 "Slot contract".
 */

import type { ComponentType } from 'react';

/**
 * The complete, ordered list of slot names. Adding a slot requires
 * updating BOTH this union AND `ALL_SLOT_NAMES` below — the literal
 * union enforces correctness at compile time on the page side,
 * `ALL_SLOT_NAMES` is the runtime iterable for tooling.
 */
export type SlotName =
  | 'nav.beforeUserMenu'
  | 'pdp.afterDescription'
  | 'pdp.priceWidget'
  | 'pdp.beforeAddToCart'
  | 'plp.beforeFilters'
  | 'cart.afterItems'
  | 'cart.beforeCheckout'
  | 'checkout.beforePaymentMethod'
  | 'checkout.afterAddress'
  | 'orders.afterSummary'
  | 'profile.afterTabs'
  | 'admin.afterDashboard';

export const ALL_SLOT_NAMES: readonly SlotName[] = [
  'nav.beforeUserMenu',
  'pdp.afterDescription',
  'pdp.priceWidget',
  'pdp.beforeAddToCart',
  'plp.beforeFilters',
  'cart.afterItems',
  'cart.beforeCheckout',
  'checkout.beforePaymentMethod',
  'checkout.afterAddress',
  'orders.afterSummary',
  'profile.afterTabs',
  'admin.afterDashboard',
] as const;

export interface SlotRegistration<
  P extends Record<string, unknown> = Record<string, unknown>,
> {
  pluginId: string;
  name: SlotName;
  component: ComponentType<P>;
  priority?: number;
  minHeight?: number;
}

const registry = new Map<SlotName, SlotRegistration[]>();

export function registerSlot<P extends Record<string, unknown>>(
  reg: SlotRegistration<P>,
): void {
  const existing = registry.get(reg.name) ?? [];
  const filtered = existing.filter((r) => r.pluginId !== reg.pluginId);
  filtered.push(reg as SlotRegistration);
  filtered.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  registry.set(reg.name, filtered);
}

export function getSlot(name: SlotName): readonly SlotRegistration[] {
  return registry.get(name) ?? [];
}

export function clearSlotRegistry(): void {
  registry.clear();
}

import { ALL_PLUGIN_SLOTS } from '@/generated/slot-registrations';

for (const reg of ALL_PLUGIN_SLOTS) {
  registerSlot(reg);
}
