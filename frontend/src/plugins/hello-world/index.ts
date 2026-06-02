// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import type { SlotRegistration } from '@/lib/slots';
import { HelloWidget } from './HelloWidget';

/**
 * @shopverse/plugin-hello-world frontend registrations.
 *
 * One slot: `pdp.afterDescription`. Matches docs/plugins/tutorial.md
 * step 4 verbatim — when the tutorial says "navigate to a PDP, the
 * violet greeting renders below the description", THIS is what
 * makes that happen.
 */
export const slots: SlotRegistration[] = [
  {
    pluginId: '@shopverse/plugin-hello-world',
    name: 'pdp.afterDescription',
    component: HelloWidget as never,
    minHeight: 24,
  },
];

export { HelloWidget };
