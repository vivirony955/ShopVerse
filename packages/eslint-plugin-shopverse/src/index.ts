// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
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

const plugin = {
  meta: {
    name: '@shopverse/eslint-plugin-shopverse',
    version: '0.1.0-alpha.1',
  },
  rules: {
    'no-hook-in-tx': noHookInTx,
    'plugin-route-prefix': pluginRoutePrefix,
    'user-before-delete-required': userBeforeDeleteRequired,
  },
};

export default plugin;
export { noHookInTx, pluginRoutePrefix, userBeforeDeleteRequired };
