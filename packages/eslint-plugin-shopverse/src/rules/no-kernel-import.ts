// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

/**
 * `no-kernel-import` — plan §7 lint rule + plan §8 boundary
 * enforcement (W6.T5).
 *
 * Catches plugins that reach into the kernel directly instead of
 * going through `@shopverse/sdk` / `@shopverse/sdk-frontend`. Two
 * import shapes are forbidden:
 *
 *   1. Bare specifiers under `@backend/...` — e.g.
 *      `import { OrdersService } from '@backend/orders/orders.service'`
 *   2. Relative paths that walk up out of `plugins/` and land in
 *      `backend/src/...` or `frontend/src/...` of the kernel —
 *      e.g. `import { PrismaService } from '../../../src/prisma/prisma.service'`
 *
 * Detection of "plugin file": same path-hint heuristic the other
 * rules use — file path contains `/plugins/` or `/packages/plugin-`.
 *
 * The rule keeps a small allow-list of kernel surfaces that are
 * intentionally grandfathered (W2/W4 carry-ins); each entry is
 * documented so the SDK re-export sweep can retire them in batches.
 */

const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://gitlab.com/aiexperts/ecommWeb/-/blob/main/packages/eslint-plugin-shopverse/docs/${name}.md`,
);

const PLUGIN_PATH_HINTS = ['/plugins/', '/packages/plugin-'];

const BACKEND_BARE_PREFIX = '@backend/';

const KERNEL_RELATIVE_PATTERNS: RegExp[] = [
  /(?:\.\.\/){2,}backend\/src\//,
  /(?:\.\.\/){2,}frontend\/src\/(?!plugins\/)/,
  /(?:\.\.\/){2,}src\/(?!plugins\/)/,
];

const GRANDFATHERED_TAIL_PATTERNS: RegExp[] = [
  // Plan §8 carry-ins; cleared incrementally by the SDK re-export
  // sweep. Each entry is documented in the W6 tracker so the lint
  // surface shrinks as the SDK surface grows.
  //
  // POST_W6 §5.1 / Task 10 architect-pre finding (2026-05-31): clearing
  // these entries via an `@shopverse/sdk/nest` sub-export is non-
  // trivial because NestJS DI uses CLASS IDENTITY for token resolution.
  // The SDK can't simply `export { PrismaService } from '<kernel>'`:
  //   - In monorepo dev mode it could, via a relative import to
  //     backend/src/... — but then the published npm tarball expects
  //     the kernel to be at the same relative path, which it isn't
  //     for third-party SDK consumers.
  //   - The clean fix is token-based DI: kernel registers
  //     `{ provide: 'KERNEL_PRISMA', useExisting: PrismaService }`,
  //     SDK exports the token + a TypeScript type for the interface,
  //     plugins inject via `@Inject('KERNEL_PRISMA')`. That's a
  //     moderate refactor — multiple-hour scope, not 30 min/plugin.
  // Deferred to a dedicated session with the architect lens. The
  // current allow-list is NOT a bug — it's the documented contract
  // for first-party plugins co-located with the kernel.
  /\/prisma\/prisma\.service$/,
  /\/common\/(hook-runner|plugin-cron-registry|plugin-context|with-cron-metric)$/,
  /\/email\/email\.service$/,
  /\/auth\/(jwt-auth\.guard|roles\.guard|roles\.decorator|current-user\.decorator|role\.enum)$/,
];

function isPluginFile(filename: string): boolean {
  return PLUGIN_PATH_HINTS.some((h) => filename.includes(h));
}

function isGrandfathered(source: string): boolean {
  return GRANDFATHERED_TAIL_PATTERNS.some((p) => p.test(source));
}

function classify(source: string): 'bare-backend' | 'relative-kernel' | 'clean' {
  if (source.startsWith(BACKEND_BARE_PREFIX)) return 'bare-backend';
  if (KERNEL_RELATIVE_PATTERNS.some((p) => p.test(source))) return 'relative-kernel';
  return 'clean';
}

export const noKernelImport = createRule({
  name: 'no-kernel-import',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Plugins must not import kernel internals directly — go through @shopverse/sdk (plan §7, §8).',
    },
    schema: [],
    messages: {
      bareBackend:
        'Plugin imports must NOT use the @backend/* path — re-export through @shopverse/sdk instead. Found: "{{ source }}"',
      relativeKernel:
        'Plugin imports must NOT walk up into the kernel source tree — re-export through @shopverse/sdk instead. Found: "{{ source }}"',
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = context.filename ?? '';
    if (!isPluginFile(filename)) return {};

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        const source = node.source.value;
        if (typeof source !== 'string') return;
        if (isGrandfathered(source)) return;

        const kind = classify(source);
        if (kind === 'bare-backend') {
          context.report({
            node: node.source,
            messageId: 'bareBackend',
            data: { source },
          });
        } else if (kind === 'relative-kernel') {
          context.report({
            node: node.source,
            messageId: 'relativeKernel',
            data: { source },
          });
        }
      },
    };
  },
});
