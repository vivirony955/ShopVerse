// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import type { SlotRegistration } from '@/lib/slots';
import { PriceAlertWidget } from './PriceAlertWidget';

/**
 * @shopverse/plugin-price-alerts frontend registrations.
 *
 * The build-time codegen target
 * `frontend/src/generated/slot-registrations.ts` imports this module
 * and flattens `slots` into `ALL_PLUGIN_SLOTS`. For the W5.T9 baseline
 * the import is hand-edited; the codegen automation lands in W6.
 *
 * Slot choice (W5.T9 deviation from plan §9 W5): the price-alert
 * button currently lives in the PDP right-pane near Add-to-Cart, so
 * `pdp.beforeAddToCart` preserves the existing UX. The plan's
 * `pdp.afterDescription` would bury the widget below the description
 * fold. Both slots are in the W5.T1 12-slot taxonomy; the choice is
 * documented in the W5 tracker and in the T9 commit message.
 */
export const slots: SlotRegistration[] = [
  {
    pluginId: '@shopverse/plugin-price-alerts',
    name: 'pdp.beforeAddToCart',
    component: PriceAlertWidget as never,
    priority: 50,
    minHeight: 48,
  },
];

export { PriceAlertWidget };
