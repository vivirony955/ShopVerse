// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

/**
 * `slot-no-data-fetch` — plan §4 frontend slot contract rule 1
 * (pure render functions; W6.T5). Slot components MUST receive
 * data via props from their kernel host page; they MUST NOT issue
 * network calls or Prisma queries during render. This rule catches
 * the most common ways a slot component reaches for data inline:
 *
 *   - bare `fetch(...)` calls
 *   - `axios(...)`, `axios.get(...)`, `axios.post(...)` member calls
 *   - any identifier in the call position named `prisma` (the
 *     Prisma client is conventionally bound to this name; plugins
 *     have no business holding one in a slot component)
 *
 * Detection scope: only TSX files under
 * `frontend/src/plugins/` or `packages/plugin-<id>/frontend/`. The
 * client-component carve-out (`'use client'`) is NOT exempt — the
 * contract is about render, not transport — but `useEffect`-scoped
 * fetches are intentionally not caught (a slot can do effect-time
 * data fetching for genuinely interactive widgets, even if the
 * preferred pattern is prop-passing). The rule is a hint, not a
 * straitjacket.
 */

const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://gitlab.com/aiexperts/ecommWeb/-/blob/main/packages/eslint-plugin-shopverse/docs/${name}.md`,
);

function isSlotFile(filename: string): boolean {
  if (!filename.endsWith('.tsx')) return false;
  if (filename.includes('/frontend/src/plugins/')) return true;
  return /\/(packages|plugins)\/[^/]+\/frontend\//.test(filename);
}

function rootIdentifierName(node: TSESTree.Node): string | undefined {
  // Walk the .object chain of a MemberExpression to its root
  // Identifier. Handles `a.b.c()` and `a.b.c.d()` alike.
  let cur: TSESTree.Node = node;
  while (cur.type === 'MemberExpression') {
    cur = cur.object;
  }
  if (cur.type === 'Identifier') return cur.name;
  return undefined;
}

function isInsideUseEffectScope(node: TSESTree.Node): boolean {
  // Walk up looking for a useEffect(() => { ... }) call expression.
  let cur: TSESTree.Node | undefined = node.parent;
  while (cur) {
    if (
      cur.type === 'CallExpression' &&
      cur.callee.type === 'Identifier' &&
      cur.callee.name === 'useEffect'
    ) {
      return true;
    }
    cur = cur.parent;
  }
  return false;
}

export const slotNoDataFetch = createRule({
  name: 'slot-no-data-fetch',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Slot components should receive data via props — no fetch/axios/prisma at render time (plan §4).',
    },
    schema: [],
    messages: {
      fetchAtRender:
        'Slot components are pure render functions — do not call `fetch()` at render time. Receive data as a prop from the kernel page.',
      axiosAtRender:
        'Slot components are pure render functions — do not call axios at render time. Receive data as a prop from the kernel page.',
      prismaAtRender:
        'Slot components must not reach for Prisma at render time. Data belongs on the kernel side; pass it through as a prop.',
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = context.filename ?? '';
    if (!isSlotFile(filename)) return {};

    return {
      CallExpression(node: TSESTree.CallExpression) {
        if (isInsideUseEffectScope(node)) return;

        const callee = node.callee;
        // fetch(...)
        if (callee.type === 'Identifier' && callee.name === 'fetch') {
          context.report({ node, messageId: 'fetchAtRender' });
          return;
        }
        // axios(...)
        if (callee.type === 'Identifier' && callee.name === 'axios') {
          context.report({ node, messageId: 'axiosAtRender' });
          return;
        }
        // axios.get / axios.post / prisma.user.findFirst / etc. —
        // walk down the MemberExpression chain to find the root
        // identifier so chains of any depth are caught.
        if (callee.type === 'MemberExpression') {
          const root = rootIdentifierName(callee);
          if (root === 'axios') {
            context.report({ node, messageId: 'axiosAtRender' });
            return;
          }
          if (root === 'prisma') {
            context.report({ node, messageId: 'prismaAtRender' });
            return;
          }
        }
      },
    };
  },
});
