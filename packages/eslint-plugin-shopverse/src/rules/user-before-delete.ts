// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

/**
 * `user-before-delete-required` — plan §10 E8 (W1.T25).
 *
 * Enforces GDPR / DPDP right-to-erasure: any plugin whose code
 * mentions a `userId`-referencing schema column MUST register the
 * `user.beforeDelete` hook so the kernel-initiated delete cascades
 * through the plugin's tables.
 *
 * What this rule cannot do as a static check: read Prisma schemas to
 * find `userId` columns directly. Instead it uses a proxy signal —
 * any plugin source file that calls `kernel.db.<model>` AND references
 * a field named `userId` in the same file is flagged unless the same
 * plugin module also calls `kernel.hooks.register('user.beforeDelete', ...)`.
 *
 * To keep the rule cheap, the analysis is FILE-LOCAL (no module
 * graph). A plugin author who splits the registration across files can
 * silence the rule with an `// eslint-disable-next-line` comment on
 * the relevant `kernel.db.<model>` line — the lint catches the common
 * accidental case, not adversarial structure.
 */

const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://gitlab.com/aiexperts/ecommWeb/-/blob/main/packages/eslint-plugin-shopverse/docs/${name}.md`,
);

const PLUGIN_PATH_HINTS = ['/plugins/', '/packages/plugin-'];

export const userBeforeDeleteRequired = createRule({
  name: 'user-before-delete-required',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Plugins storing user-linked data must register the user.beforeDelete hook (plan §10 E8 — GDPR/DPDP)',
    },
    schema: [],
    messages: {
      missingHook:
        'Plugin source references userId on a kernel.db.* call but does not register a "user.beforeDelete" hook. This causes orphan PII on user deletion (GDPR / DPDP).',
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = context.filename ?? '';
    const isPluginFile = PLUGIN_PATH_HINTS.some((h) => filename.includes(h));
    if (!isPluginFile) return {};

    let touchesUserId = false;
    let kernelDbAccessNode: TSESTree.Node | null = null;
    let registersUserBeforeDelete = false;

    function isKernelDbAccess(node: TSESTree.MemberExpression): boolean {
      // Match `kernel.db.<anything>`
      const inner = node.object;
      if (inner.type !== 'MemberExpression') return false;
      const innerObj = inner.object;
      const innerProp = inner.property;
      return (
        innerObj.type === 'Identifier' &&
        innerObj.name === 'kernel' &&
        innerProp.type === 'Identifier' &&
        innerProp.name === 'db'
      );
    }

    function isHooksRegisterCall(node: TSESTree.CallExpression): boolean {
      // Match `kernel.hooks.register('user.beforeDelete', ...)` or
      //       `hooks.register('user.beforeDelete', ...)`
      if (node.callee.type !== 'MemberExpression') return false;
      const prop = node.callee.property;
      if (prop.type !== 'Identifier' || prop.name !== 'register') return false;

      const obj = node.callee.object;
      const objName =
        obj.type === 'Identifier'
          ? obj.name
          : obj.type === 'MemberExpression' && obj.property.type === 'Identifier'
            ? obj.property.name
            : '';
      if (objName !== 'hooks') return false;

      const firstArg = node.arguments[0];
      return (
        firstArg !== undefined &&
        firstArg.type === 'Literal' &&
        firstArg.value === 'user.beforeDelete'
      );
    }

    return {
      MemberExpression(node) {
        if (
          node.property.type === 'Identifier' &&
          node.property.name === 'userId'
        ) {
          touchesUserId = true;
        }
        if (isKernelDbAccess(node) && !kernelDbAccessNode) {
          kernelDbAccessNode = node;
        }
      },
      Property(node) {
        // Object literals like `{ userId: 1 }` from new/upsert calls.
        if (node.key.type === 'Identifier' && node.key.name === 'userId') {
          touchesUserId = true;
        }
      },
      CallExpression(node) {
        if (isHooksRegisterCall(node)) {
          registersUserBeforeDelete = true;
        }
      },
      'Program:exit'() {
        if (
          touchesUserId &&
          kernelDbAccessNode &&
          !registersUserBeforeDelete
        ) {
          context.report({
            node: kernelDbAccessNode,
            messageId: 'missingHook',
          });
        }
      },
    };
  },
});
