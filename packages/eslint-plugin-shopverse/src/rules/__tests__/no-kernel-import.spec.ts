// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from '@jest/globals';
import { noKernelImport } from '../no-kernel-import';

RuleTester.afterAll = afterAll;
RuleTester.it = it;
RuleTester.describe = describe;

const tester = new RuleTester();

const PLUGIN_FILE = '/repo/backend/plugins/price-alerts/src/alerts.service.ts';
const KERNEL_FILE = '/repo/backend/src/orders/orders.service.ts';

tester.run('no-kernel-import', noKernelImport, {
  valid: [
    // Plugin importing from the SDK — happy path.
    {
      filename: PLUGIN_FILE,
      code: `import { KernelContext } from '@shopverse/sdk';`,
    },
    // Plugin importing a sibling file — fine.
    {
      filename: PLUGIN_FILE,
      code: `import { helper } from './helper';`,
    },
    // Plugin importing a grandfathered kernel surface — fine while
    // SDK re-export sweep is in progress.
    {
      filename: PLUGIN_FILE,
      code: `import { PrismaService } from '../../../src/prisma/prisma.service';`,
    },
    // Kernel file (not under /plugins/) — rule inert.
    {
      filename: KERNEL_FILE,
      code: `import { PrismaService } from '../prisma/prisma.service';`,
    },
  ],
  invalid: [
    // Bare @backend/* import from plugin code.
    {
      filename: PLUGIN_FILE,
      code: `import { OrdersService } from '@backend/orders/orders.service';`,
      errors: [{ messageId: 'bareBackend' }],
    },
    // Relative path walking into a non-grandfathered kernel module.
    {
      filename: PLUGIN_FILE,
      code: `import { ReviewsService } from '../../../src/reviews/reviews.service';`,
      errors: [{ messageId: 'relativeKernel' }],
    },
    // Reaching into the kernel-side frontend tree.
    {
      filename: '/repo/frontend/src/plugins/foo/Widget.tsx',
      code: `import { OrderRow } from '../../../src/app/(shop)/orders/_components/OrderRow';`,
      errors: [{ messageId: 'relativeKernel' }],
    },
  ],
});
