// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

/**
 * `no-hook-in-tx` — plan §5 rule #1 (W1.T9).
 *
 * Prevents kernel code from invoking the HookRunner inside a Prisma
 * `$transaction` block. Plugin hooks MUST NOT run inside a transaction:
 * they could deadlock by acquiring inner locks, blow the per-statement
 * timeout, or hold a connection during external I/O.
 *
 * The rule fires when a `CallExpression` whose callee ends in
 * `.runSync` or `.run` is found anywhere inside the function body of a
 * `$transaction(...)` call. This is intentionally lexical — we don't
 * try to model control flow. A false positive can be silenced with the
 * standard `// eslint-disable-next-line` comment.
 *
 * The detection covers both flavours of $transaction:
 *
 *   prisma.$transaction(async (tx) => { ... })
 *   prisma.$transaction([ ... ])  // array form — not a concern here
 *
 * Only the callback form is inspected.
 */

const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://gitlab.com/aiexperts/ecommWeb/-/blob/main/packages/eslint-plugin-shopverse/docs/${name}.md`,
);

type HookCallSpec = {
  /** The callee's `.property.name`, e.g. `runSync` or `run`. */
  readonly property: string;
  /** Whether the callee object name should LOOK LIKE a hook runner. */
  readonly objectMatcher?: RegExp;
};

const HOOK_CALL_SPECS: readonly HookCallSpec[] = [
  { property: 'runSync', objectMatcher: /hook|HookRunner/i },
  // Future: HookRunner.run, EventBus.publish would also be illegal in tx.
];

export const noHookInTx = createRule({
  name: 'no-hook-in-tx',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Plugin hooks must not run inside a Prisma $transaction block (plan §5 rule #1)',
    },
    schema: [],
    messages: {
      hookInsideTransaction:
        'Plugin hook "{{ method }}" called inside $transaction. Hooks run BEFORE or AFTER the transaction, never inside. Move this call outside the $transaction callback.',
    },
  },
  defaultOptions: [],
  create(context) {
    const transactionDepth: TSESTree.Node[] = [];

    function isTransactionCall(node: TSESTree.CallExpression): boolean {
      if (node.callee.type !== 'MemberExpression') return false;
      const prop = node.callee.property;
      if (prop.type !== 'Identifier') return false;
      return prop.name === '$transaction';
    }

    function matchesHookCall(
      node: TSESTree.CallExpression,
    ): HookCallSpec | null {
      if (node.callee.type !== 'MemberExpression') return null;
      const prop = node.callee.property;
      if (prop.type !== 'Identifier') return null;
      const obj = node.callee.object;
      const objText =
        obj.type === 'Identifier'
          ? obj.name
          : obj.type === 'MemberExpression' &&
              obj.property.type === 'Identifier'
            ? obj.property.name
            : '';
      for (const spec of HOOK_CALL_SPECS) {
        if (prop.name !== spec.property) continue;
        if (spec.objectMatcher && !spec.objectMatcher.test(objText)) continue;
        return spec;
      }
      return null;
    }

    return {
      CallExpression(node) {
        if (isTransactionCall(node)) {
          // The callback (1st argument, if a function) is the tx body.
          const cb = node.arguments[0];
          if (
            cb &&
            (cb.type === 'ArrowFunctionExpression' ||
              cb.type === 'FunctionExpression')
          ) {
            transactionDepth.push(cb);
          }
          return;
        }

        if (transactionDepth.length === 0) return;

        const spec = matchesHookCall(node);
        if (!spec) return;

        // Confirm `node` is lexically inside the most recent tx callback.
        const txBody = transactionDepth[transactionDepth.length - 1];
        if (isDescendant(node, txBody)) {
          context.report({
            node,
            messageId: 'hookInsideTransaction',
            data: { method: spec.property },
          });
        }
      },
      'CallExpression:exit'(node) {
        if (!isTransactionCall(node)) return;
        const cb = node.arguments[0];
        if (
          cb &&
          (cb.type === 'ArrowFunctionExpression' ||
            cb.type === 'FunctionExpression') &&
          transactionDepth[transactionDepth.length - 1] === cb
        ) {
          transactionDepth.pop();
        }
      },
    };
  },
});

function isDescendant(
  node: TSESTree.Node,
  ancestor: TSESTree.Node,
): boolean {
  let cur: TSESTree.Node | undefined = node.parent;
  while (cur) {
    if (cur === ancestor) return true;
    cur = cur.parent;
  }
  return false;
}
