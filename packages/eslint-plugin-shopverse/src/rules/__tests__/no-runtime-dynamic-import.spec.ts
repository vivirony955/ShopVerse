// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from '@jest/globals';
import { noRuntimeDynamicImport } from '../no-runtime-dynamic-import';

RuleTester.afterAll = afterAll;
RuleTester.it = it;
RuleTester.describe = describe;

const tester = new RuleTester();

const FE_PLUGIN_FILE = '/repo/frontend/src/plugins/foo/Widget.tsx';
const FE_KERNEL_FILE = '/repo/frontend/src/app/(shop)/products/page.tsx';
const BE_PLUGIN_FILE = '/repo/backend/plugins/foo/src/foo.service.ts';

tester.run('no-runtime-dynamic-import', noRuntimeDynamicImport, {
  valid: [
    // Frontend plugin — static import is fine.
    {
      filename: FE_PLUGIN_FILE,
      code: `import { Widget } from './Widget';`,
    },
    // Kernel page may use dynamic import.
    {
      filename: FE_KERNEL_FILE,
      code: `const M = await import('./HeavyClientOnly');`,
    },
    // Backend plugin code — rule scope is frontend only.
    {
      filename: BE_PLUGIN_FILE,
      code: `const M = await import('./helper');`,
    },
  ],
  invalid: [
    {
      filename: FE_PLUGIN_FILE,
      code: `const M = await import('./HeavyClient');`,
      errors: [{ messageId: 'dynamicImport' }],
    },
  ],
});
