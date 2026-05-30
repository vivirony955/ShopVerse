// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * AUTO-GENERATED — do not edit by hand once W6 codegen lands.
 *
 * Codegen target for `frontend/src/lib/slots.ts`. The build pipeline
 * reads `backend/plugins.config.ts` and, for each enabled plugin
 * with a frontend module, emits an `import` + flattens the plugin's
 * `slots` array into `ALL_PLUGIN_SLOTS`.
 *
 * For W5.T9 the file is hand-edited to wire the first plugin
 * (`@shopverse/plugin-price-alerts`). When W6 codegen ships, this
 * file becomes auto-generated and the hand-edit is replaced.
 *
 * Plugin frontend code location (per W5.D3):
 *   - First-party plugins: `frontend/src/plugins/<plugin>/` —
 *     shares the host's node_modules for React/Next deps.
 *   - Third-party plugins (W6+): published as npm packages,
 *     installed into `frontend/node_modules/@shopverse/plugin-X`,
 *     imported via the package's `frontend` exports entry.
 */

import type { SlotRegistration } from '@/lib/slots';
import { slots as priceAlertsSlots } from '@/plugins/price-alerts';
import { slots as helloWorldSlots } from '@/plugins/hello-world';

export const ALL_PLUGIN_SLOTS: SlotRegistration[] = [
  ...priceAlertsSlots,
  ...helloWorldSlots,
];
