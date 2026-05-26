# @shopverse/eslint-plugin-shopverse

ESLint rules enforcing the [ShopVerse](https://gitlab.com/aiexperts/ecommWeb)
plugin contract. Source-available under
[Elastic License 2.0](../../LICENSE).

> **Status:** v0.1.0-alpha. Pre-stable. Rule set evolves through W6.

## Install

```bash
npm install --save-dev @shopverse/eslint-plugin-shopverse eslint
```

## Usage (flat config)

```typescript
// eslint.config.mjs
import shopverse from '@shopverse/eslint-plugin-shopverse';

export default [
  {
    plugins: { shopverse },
    rules: {
      'shopverse/no-hook-in-tx': 'error',
      'shopverse/plugin-route-prefix': 'error',
      'shopverse/user-before-delete-required': 'warn',
    },
  },
];
```

## Rules

| Rule | What it catches | Plan ref |
|---|---|---|
| `no-hook-in-tx` | `HookRunner.runSync()` called inside a `prisma.$transaction(async (tx) => {...})` callback. Hooks must run BEFORE or AFTER the transaction, never inside. | §5 rule #1 (W1.T9) |
| `plugin-route-prefix` | Plugin-path `@Controller()` decorators that don't start with `plugin/`. Prevents plugin routes from colliding with kernel routes. | §4 API namespacing (W1.T8) |
| `user-before-delete-required` | Plugin source touching `userId` via `kernel.db.*` without registering a `user.beforeDelete` hook (GDPR / DPDP right-to-erasure). | §10 E8 (W1.T25) |

Each rule documents its detection signal in its source. RuleTester fixtures live under
[`src/rules/__tests__/`](src/rules/__tests__/).

## License

[Elastic License 2.0](../../LICENSE).
