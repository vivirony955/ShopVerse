// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from '@jest/globals';
import { noHookInTx } from '../no-hook-in-tx';

RuleTester.afterAll = afterAll;
RuleTester.it = it;
RuleTester.describe = describe;

const tester = new RuleTester();

tester.run('no-hook-in-tx', noHookInTx, {
  valid: [
    {
      // Hook call OUTSIDE a transaction — fine.
      code: `
        async function placeOrder(prisma, hookRunner) {
          await hookRunner.runSync('order.preValidate', ctx);
          await prisma.$transaction(async (tx) => {
            await tx.order.create({ data: {} });
          });
        }
      `,
    },
    {
      // Unrelated call inside transaction.
      code: `
        async function placeOrder(prisma) {
          await prisma.$transaction(async (tx) => {
            await tx.order.create({ data: {} });
            await tx.payment.create({ data: {} });
          });
        }
      `,
    },
    {
      // Array form of $transaction (batched promises) — rule does not fire.
      code: `
        async function placeOrder(prisma) {
          await prisma.$transaction([
            prisma.order.create({ data: {} }),
          ]);
        }
      `,
    },
  ],
  invalid: [
    {
      // The textbook violation.
      code: `
        async function placeOrder(prisma, hookRunner) {
          await prisma.$transaction(async (tx) => {
            await hookRunner.runSync('order.preValidate', ctx);
            await tx.order.create({ data: {} });
          });
        }
      `,
      errors: [{ messageId: 'hookInsideTransaction' }],
    },
    {
      // Nested member access (this.hookRunner.runSync) still flagged.
      code: `
        class OrdersService {
          constructor(prisma, hookRunner) {
            this.prisma = prisma;
            this.hookRunner = hookRunner;
          }
          async placeOrder() {
            await this.prisma.$transaction(async (tx) => {
              await this.hookRunner.runSync('order.preValidate', ctx);
            });
          }
        }
      `,
      errors: [{ messageId: 'hookInsideTransaction' }],
    },
  ],
});
