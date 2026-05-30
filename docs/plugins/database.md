# Plugin Database Rules

Plan §4 governance + §10 E5/E8/E9.

## Schema folder layout

Prisma 6's `prismaSchemaFolder` preview is enabled (W1.T7). Models
are split across files in `prisma/schema/`:

```
prisma/schema/
├── main.prisma                   # kernel models — 54+ kernel models live here
├── plugin-config.prisma          # PluginConfig table (kernel-owned)
├── price-alerts.prisma           # @shopverse/plugin-price-alerts
├── blog.prisma                   # @shopverse/plugin-blog
├── price-history.prisma          # @shopverse/plugin-price-history
├── volume-discounts.prisma       # @shopverse/plugin-volume-discounts
└── notifications.prisma          # @shopverse/plugin-notifications
```

Each plugin owns its own file. Adding a plugin = adding a file.
Removing a plugin = deleting the file + a migration that drops the
plugin's tables. Prisma stitches them together at `generate` time.

## FK rules

Plan §10 E5 / E8: plugins MUST NOT add FKs to kernel tables.
Reason: tight coupling defeats plugin removability. If your plugin
needs to reference a kernel row (user, product, order), do it
without an FK — use an `Int` column and let your service
defensively check existence.

**Grandfathered exception**: the W4 first-party plugins kept their
FKs to kernel tables because the Prisma-side cascade semantics
matter (e.g. `Notification.userId → User.onDelete: Cascade`).
Each grandfathered FK is documented at the top of the plugin's
schema file:

```prisma
// Grandfathered FK to kernel User.id — onDelete: Cascade is the
// only safe cascade semantic; plugin model gets reaped when a
// user is GDPR-deleted. Plan §10 E8 erasure path remains
// authoritative.
model Notification {
  id      Int    @id @default(autoincrement())
  userId  Int
  user    User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  // ...
}
```

For new plugins, the recommended pattern is **no FK + a hook**:

```prisma
// In your plugin's schema file:
model MyPluginAuditRow {
  id       Int   @id @default(autoincrement())
  userId   Int   // not a relation — defensive lookup in service
  payload  Json
  createdAt DateTime @default(now())
  @@index([userId])
}
```

Then register a `user.beforeDelete` hook in your bootstrap that
deletes the rows by `userId`. The lint rule
`user-before-delete-required` warns if you skip this.

## Migration ordering (plan §10 E9)

The CLI shipped with `@shopverse/cli`:

```bash
# Kernel first:
npx prisma migrate deploy --schema prisma/schema

# Plugins in manifest order:
npx shopverse plugin:migrate
```

The plugin migration runner iterates `plugins.config.ts` in declared
order. If plugin B's schema references a model in plugin A's schema
(allowed; both are plugin-side), A must be declared first. Each
plugin's migrations live in `prisma/migrations/<plugin>/`.

## Uninstall semantics

Removing a plugin from the manifest stops loading it. The plugin's
**data stays** by default — operators might re-install later, or the
data has business value (e.g. loyalty history).

To drop a plugin's data explicitly:

```bash
npx shopverse plugin:uninstall <id> --drop-data
```

This runs the plugin's teardown migration (or warns if none ships).
Without `--drop-data`, the migration is skipped and the tables remain
intact. Plugin authors SHOULD ship a teardown migration so removal
is clean for operators who want it.

## Right-to-erasure (plan §10 E8)

When `DELETE /api/users/me` runs, the kernel publishes the
`user.beforeDelete` hook. Every plugin that stores user-linked data
MUST register this hook and delete its rows. Failure is treated like
a financial path error: kernel aborts the deletion, alerts ops, and
the audit log records which plugin's hook failed.

```ts
// In bootstrap:
this.hooks.register('user.beforeDelete', async (ctx) => {
  await this.prisma.myPluginAuditRow.deleteMany({
    where: { userId: ctx.userId },
  });
});
```

The lint rule `user-before-delete-required` warns on any plugin
schema with a `userId`-like column that doesn't register this hook.
The W6.T-flakes investigation captures the test that exercises the
cross-plugin GDPR delete path.

## Per-plugin Prisma client + concurrency

Plugins do NOT receive a raw `PrismaClient`. The SDK exposes
`kernel.db` — a semaphore-wrapped Prisma client with per-plugin
concurrency limits:

- Default cap: 3 concurrent queries per plugin
- Configurable in `PluginManifest.config.dbConcurrency` (max 10)
- Excess queries queue FIFO with a 100 ms wait timeout
- Metric: `shopverse_plugin_db_queued_total{plugin="..."}`

This prevents one runaway plugin from draining the shared pool. See
plan §10 E7 for the design rationale.

## Plugin settings (`PluginConfig`)

Per plan §10 E10 you have two options for plugin-author-editable
settings:

1. **Plugin-owned table** — drop a `<plugin>_settings` model into
   your plugin's `prisma` file. Use this for structured-relational
   configuration that benefits from real columns + indexes.
2. **Kernel `PluginConfig` table** — call
   `kernel.config.set(pluginId, key, value)`. Use this for simple
   key-value config. The kernel table backs every plugin; no schema
   work.

The SDK pattern (option 2) is recommended unless you need
structured queries on your config.

## Schema validation gate

Before merging a schema change:

```bash
npx prisma validate --schema prisma/schema
npx prisma generate --schema prisma/schema
```

The plugin smoke test then proves the new model survives end-to-end:

```bash
cd test && npx jest <plugin> --runInBand --forceExit
```

A migration that adds a NOT NULL column to an existing table without
a backfill will pass `prisma validate` but break the integration
suite — the suite is the real schema gate.
