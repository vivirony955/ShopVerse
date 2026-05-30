# Plugin Conventions — lint rules + PR checklist

Authoritative source for what a plugin PR must satisfy.

## Lint rules

`@shopverse/eslint-plugin-shopverse` ships 6 rules. Enable them all
in `eslint.config.js`:

```js
import shopverse from '@shopverse/eslint-plugin-shopverse';

export default [
  {
    plugins: { shopverse },
    rules: {
      'shopverse/no-hook-in-tx': 'error',
      'shopverse/plugin-route-prefix': 'error',
      'shopverse/user-before-delete-required': 'warn',
      'shopverse/no-kernel-import': 'error',
      'shopverse/no-runtime-dynamic-import': 'error',
      'shopverse/slot-no-data-fetch': 'warn',
    },
  },
];
```

| Rule | Severity | Catches |
|---|---|---|
| `no-hook-in-tx` | error | `prisma.$transaction(async (tx) => { hookRunner.run(...) })` — hooks may not execute inside a kernel transaction |
| `plugin-route-prefix` | error | `@Controller('foo')` in plugin code without `plugin/` prefix |
| `user-before-delete-required` | warn | Plugin schemas with a `userId` column and no `user.beforeDelete` hook registered for the plugin's id |
| `no-kernel-import` | error | `import from '@backend/*'` or relative path walking into kernel source (a small grandfathered allow-list applies) |
| `no-runtime-dynamic-import` | error | Frontend plugin code using `import('./Component')` for slots |
| `slot-no-data-fetch` | warn | `.tsx` slot component calling `fetch(...)`, `axios.*(...)`, or `prisma.*` at render time (effect-scoped calls allowed) |

Source: [packages/eslint-plugin-shopverse/src/rules/](../../packages/eslint-plugin-shopverse/src/rules/).

Disabling a rule for a specific line should be rare. If you find
yourself repeatedly disabling a rule, file an issue — either the
rule is wrong or the plugin needs refactoring.

## PR template

Open plugin PRs with `?template=plugin.md` in the URL. The template
([.github/PULL_REQUEST_TEMPLATE/plugin.md](../../.github/PULL_REQUEST_TEMPLATE/plugin.md))
prompts for:

- **Plugin summary** — id, tier (pluggable / core-extended), and the
  hook / event / strategy / slot / cron / queue surface the plugin
  touches.
- **Boundary checklist** — id format, location convention, SDK-only
  imports, CODEOWNERS, manifest entry with `kernelVersion`.
- **Database governance** — schema-folder placement, no FKs into
  kernel tables (or a documented exception), `user.beforeDelete`
  hook for any `userId` column, migration ordering, uninstall
  semantics.
- **Performance budgets** — Prisma query count per hook, cron rate
  limit, k6 baseline regression, bundle size, hydration weight,
  SSR slot time.
- **Safety + observability** — CircuitBreaker fallback documented,
  Prometheus metric attribution, OTel span tagging (automatic via
  SDK), Sentry sample rate if chatty, declared scopes, audit-log
  calls for admin actions.
- **Frontend slot contract** — pure render, RSC default, `minHeight`
  per registration, `t(key, defaultEn)` strings, axe-clean (W5.T5),
  JSON-LD via the registry.
- **Testing** — smoke spec + integration spec + the full
  `tsc/lint/jest/bundle/hydration` gate suite.
- **Docs** — entry in `docs/plugins/<name>.md` + cross-link from
  [index.md](index.md).
- **ELv2 sign-off** — `git commit -s`.

## SemVer + deprecation policy

`@shopverse/sdk` follows SemVer from v0.2.0 onward.

- **Adding** a hook / event / strategy / slot = minor bump.
- **Renaming** or **removing** = major bump.
- **Behaviour change** (e.g. hook now blocks where it used to be
  fire-and-forget) = major bump.

When the SDK needs to retire a contract:

1. Introduce the new name in a minor release.
2. Mark the old name `@deprecated` in TypeDoc with a pointer to the
   replacement.
3. Keep both for at least one minor release (two months absolute
   minimum).
4. Remove the old name in the next major release; document the
   migration in `CHANGELOG.md`.

Plugins should pin to a minor (`"kernelVersion": "^0.1.0"`) so
patch-level kernel updates don't require a re-test.

## CODEOWNERS

Each plugin SHOULD have one owner declared in `.github/CODEOWNERS`:

```
backend/plugins/<name>/                 @your-handle
frontend/src/plugins/<name>/            @your-handle
prisma/schema/<name>.prisma             @your-handle
docs/plugins/<name>.md                  @your-handle
```

The kernel team reviews boundary changes only — the owner reviews
plugin internals.
