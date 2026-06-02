// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

/**
 * `no-runtime-dynamic-import` — plan §4 frontend slot contract
 * (W6.T5). Frontend plugin slot components MUST be statically
 * imported so they tree-shake and survive SSR. Runtime
 * `import('...')` in a slot module defeats both properties.
 *
 * Scope: frontend plugin code only — file path contains
 * `/frontend/src/plugins/` (W5.D3 first-party layout) or
 * `/packages/plugin-<id>/frontend/` (third-party convention). The
 * rule explicitly does NOT fire on kernel pages — kernel pages
 * may legitimately use `next/dynamic` for non-slot UI.
 *
 * Trigger: `ImportExpression` (the AST node for `import(...)`).
 * Static `import { x } from '...'` is `ImportDeclaration` — not
 * matched.
 */

const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://gitlab.com/aiexperts/ecommWeb/-/blob/main/packages/eslint-plugin-shopverse/docs/${name}.md`,
);

const FRONTEND_PLUGIN_HINTS = [
  '/frontend/src/plugins/',
  '/packages/plugin-',
  '/plugins/',
];

function isFrontendPluginFile(filename: string): boolean {
  // Be conservative — must contain the frontend hint OR be a TSX
  // file under a plugin path (slot components are .tsx, plugin
  // backend code is .ts and exempt).
  if (
    filename.includes('/frontend/src/plugins/') ||
    filename.includes('/frontend/')
  ) {
    return FRONTEND_PLUGIN_HINTS.some((h) => filename.includes(h));
  }
  // Third-party plugin frontend dirs (e.g.
  // packages/plugin-foo/frontend/).
  return /\/(packages|plugins)\/[^/]+\/frontend\//.test(filename);
}

export const noRuntimeDynamicImport = createRule({
  name: 'no-runtime-dynamic-import',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Frontend plugin slot components must use static imports (plan §4).',
    },
    schema: [],
    messages: {
      dynamicImport:
        'Plugin frontend code must not use runtime `import()` — slots are compile-time and tree-shakable. Use a static `import` declaration instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = context.filename ?? '';
    if (!isFrontendPluginFile(filename)) return {};

    return {
      ImportExpression(node: TSESTree.ImportExpression) {
        context.report({ node, messageId: 'dynamicImport' });
      },
    };
  },
});
