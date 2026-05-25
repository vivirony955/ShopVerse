// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

/**
 * `plugin-route-prefix` — plan §4 API namespacing (W1.T8).
 *
 * Enforces that any NestJS @Controller in a plugin package declares a
 * route prefix starting with `plugin/<plugin-id-tail>/...`. This keeps
 * plugin routes namespaced under `/api/plugin/...` so they're visible
 * in OpenAPI under their own tagged group and cannot collide with
 * kernel routes.
 *
 * Detection:
 *   - File path contains `/plugins/` or `/packages/plugin-` (heuristic
 *     for plugin code; kernel code is exempt)
 *   - Class has a `@Controller(...)` decorator
 *   - The decorator's first argument is a STRING LITERAL
 *   - The string must start with `plugin/`
 *
 * What it does NOT do:
 *   - Validate the second segment matches the plugin's actual id (that
 *     check belongs to the plugin loader at runtime, not lint).
 *   - Fire on `@Controller()` with no args (no prefix, root-level) —
 *     these would collide with kernel routes too but the rule keeps
 *     scope narrow.
 */

const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://gitlab.com/aiexperts/ecommWeb/-/blob/main/packages/eslint-plugin-shopverse/docs/${name}.md`,
);

const PLUGIN_PATH_HINTS = ['/plugins/', '/packages/plugin-'];

export const pluginRoutePrefix = createRule({
  name: 'plugin-route-prefix',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Plugin @Controller routes must start with "plugin/" (plan §4 API namespacing)',
    },
    schema: [],
    messages: {
      missingPrefix:
        'Plugin @Controller route "{{ value }}" must start with "plugin/" to avoid colliding with kernel routes.',
      missingArg:
        'Plugin @Controller must declare an explicit route prefix starting with "plugin/" — implicit root-level controllers are not allowed.',
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = context.filename ?? '';
    const isPluginFile = PLUGIN_PATH_HINTS.some((h) => filename.includes(h));
    if (!isPluginFile) return {};

    return {
      Decorator(node: TSESTree.Decorator) {
        const expr = node.expression;
        if (expr.type !== 'CallExpression') return;
        const callee = expr.callee;
        if (callee.type !== 'Identifier' || callee.name !== 'Controller') return;

        const firstArg = expr.arguments[0];
        if (!firstArg) {
          context.report({ node, messageId: 'missingArg' });
          return;
        }

        if (firstArg.type !== 'Literal' || typeof firstArg.value !== 'string') {
          // Non-literal (e.g. computed from a constant) — skip, we can't reason about it.
          return;
        }
        const value = firstArg.value;
        if (!value.startsWith('plugin/')) {
          context.report({
            node: firstArg,
            messageId: 'missingPrefix',
            data: { value },
          });
        }
      },
    };
  },
});
