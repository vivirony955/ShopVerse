# @shopverse/cli

Plugin tooling for the [ShopVerse](https://gitlab.com/aiexperts/ecommWeb)
ecommerce platform. Source-available under
[Elastic License 2.0](../../LICENSE).

> **Status:** v0.1.0-alpha. Pre-stable. CLI surface evolves until v0.2.0
> ships in the main ShopVerse repo.

## Install

```bash
npm install --save-dev @shopverse/cli
```

The CLI is also re-exported as a library so deploy scripts and the
future `create-shopverse-plugin` scaffolder can embed the same logic
without spawning a subprocess.

## Commands

### `shopverse plugin:migrate`

Runs each enabled plugin's Prisma migrations in the order declared in
`plugins.config.ts`. Stops on the first failure — ordering matters when
plugin B reads tables that plugin A owns.

```bash
npx shopverse plugin:migrate
npx shopverse plugin:migrate --manifest=path/to/plugins.config.ts
```

Per-plugin status is printed:

```
✓ @shopverse/referral — applied
· @shopverse/blog — skipped (disabled in manifest)
✗ @shopverse/price-alerts — failed (P3009: migration 20260601... failed)
```

Exit code 0 on success (or only skipped/applied), non-zero on any
failure. See [plan §10 E9](../../docs/architecture/scope.md) for the
ordering contract.

## Library API

```typescript
import { migrateAll, allSucceeded } from '@shopverse/cli';
import manifest from './plugins.config';

const results = migrateAll(manifest);
if (!allSucceeded(results)) {
  process.exit(1);
}
```

The default `DefaultMigrationRunner` shells out to `npx prisma migrate
deploy`; tests inject their own `MigrationRunner` to avoid subprocess
churn.

## License

[Elastic License 2.0](../../LICENSE).
