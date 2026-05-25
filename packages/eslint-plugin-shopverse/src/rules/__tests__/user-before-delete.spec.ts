// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from '@jest/globals';
import { userBeforeDeleteRequired } from '../user-before-delete';

RuleTester.afterAll = afterAll;
RuleTester.it = it;
RuleTester.describe = describe;

const tester = new RuleTester();

const PLUGIN_FILE = '/repo/backend/plugins/referral/src/referral.service.ts';
const KERNEL_FILE = '/repo/backend/src/orders/orders.service.ts';

tester.run('user-before-delete-required', userBeforeDeleteRequired, {
  valid: [
    {
      // Plugin that touches userId AND registers user.beforeDelete — OK.
      filename: PLUGIN_FILE,
      code: `
        export const plugin = {
          async onRegister(kernel) {
            kernel.hooks.register('user.beforeDelete', async (ctx) => {
              await kernel.db.referralCode.deleteMany({ where: { userId: ctx.userId } });
            });
            await kernel.db.referralCode.findMany({ where: { userId: 1 } });
          }
        };
      `,
    },
    {
      // Plugin that touches NO user-linked data — no requirement.
      filename: PLUGIN_FILE,
      code: `
        export const plugin = {
          async onRegister(kernel) {
            await kernel.db.flashSale.findMany({ where: { active: true } });
          }
        };
      `,
    },
    {
      // Kernel code — rule inert.
      filename: KERNEL_FILE,
      code: `
        async function listOrders(userId) {
          await prisma.order.findMany({ where: { userId } });
        }
      `,
    },
  ],
  invalid: [
    {
      // Plugin touches userId via kernel.db but no user.beforeDelete hook → flagged.
      filename: PLUGIN_FILE,
      code: `
        export const plugin = {
          async onRegister(kernel) {
            await kernel.db.referralCode.findMany({ where: { userId: 1 } });
          }
        };
      `,
      errors: [{ messageId: 'missingHook' }],
    },
  ],
});
