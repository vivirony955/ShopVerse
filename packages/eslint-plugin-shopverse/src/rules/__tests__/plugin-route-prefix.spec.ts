// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from '@jest/globals';
import { pluginRoutePrefix } from '../plugin-route-prefix';

RuleTester.afterAll = afterAll;
RuleTester.it = it;
RuleTester.describe = describe;

const tester = new RuleTester();

// Plugin-path file — rule active.
const PLUGIN_FILE = '/repo/backend/plugins/price-alerts/src/alerts.controller.ts';

// Kernel file — rule inert.
const KERNEL_FILE = '/repo/backend/src/orders/orders.controller.ts';

tester.run('plugin-route-prefix', pluginRoutePrefix, {
  valid: [
    {
      // Correct prefix.
      filename: PLUGIN_FILE,
      code: `
        @Controller('plugin/price-alerts')
        class AlertsController {}
      `,
    },
    {
      // Kernel controller is exempt.
      filename: KERNEL_FILE,
      code: `
        @Controller('orders')
        class OrdersController {}
      `,
    },
    {
      // Computed prefix (non-literal) — skipped (we can't reason about it).
      filename: PLUGIN_FILE,
      code: `
        const PREFIX = 'plugin/foo';
        @Controller(PREFIX)
        class FooController {}
      `,
    },
  ],
  invalid: [
    {
      // Wrong prefix.
      filename: PLUGIN_FILE,
      code: `
        @Controller('alerts')
        class AlertsController {}
      `,
      errors: [{ messageId: 'missingPrefix' }],
    },
    {
      // Empty @Controller() — would collide with kernel root.
      filename: PLUGIN_FILE,
      code: `
        @Controller()
        class AlertsController {}
      `,
      errors: [{ messageId: 'missingArg' }],
    },
  ],
});
