// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * @shopverse/eslint-plugin-shopverse
 *
 * ESLint rules enforcing the ShopVerse plugin contract. See the plan
 * §7 (lint rules) for the full taxonomy. This package ships the rules
 * implementable today; rules that require module-graph traversal or
 * type information across files are deferred to W6.T5.
 *
 * Usage (flat config):
 *
 *   import shopverse from '@shopverse/eslint-plugin-shopverse';
 *
 *   export default [
 *     {
 *       plugins: { shopverse },
 *       rules: {
 *         'shopverse/no-hook-in-tx': 'error',
 *         'shopverse/plugin-route-prefix': 'error',
 *         'shopverse/user-before-delete-required': 'warn',
 *       },
 *     },
 *   ];
 */

import { noHookInTx } from './rules/no-hook-in-tx';
import { pluginRoutePrefix } from './rules/plugin-route-prefix';
import { userBeforeDeleteRequired } from './rules/user-before-delete';
import { noKernelImport } from './rules/no-kernel-import';
import { noRuntimeDynamicImport } from './rules/no-runtime-dynamic-import';
import { slotNoDataFetch } from './rules/slot-no-data-fetch';

const plugin = {
  meta: {
    name: '@shopverse/eslint-plugin-shopverse',
    version: '0.1.0-alpha.1',
  },
  rules: {
    'no-hook-in-tx': noHookInTx,
    'plugin-route-prefix': pluginRoutePrefix,
    'user-before-delete-required': userBeforeDeleteRequired,
    'no-kernel-import': noKernelImport,
    'no-runtime-dynamic-import': noRuntimeDynamicImport,
    'slot-no-data-fetch': slotNoDataFetch,
  },
};

export default plugin;
export {
  noHookInTx,
  pluginRoutePrefix,
  userBeforeDeleteRequired,
  noKernelImport,
  noRuntimeDynamicImport,
  slotNoDataFetch,
};
