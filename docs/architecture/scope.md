# Architecture Scope — In and Out

What ShopVerse's plugin architecture aims to do, and what it explicitly
does NOT.

## In scope (today, v0.x → v1.0)

- **Modular monolith** — single deployable, single Node process per
  pod, single shared Postgres + Redis
- **Plugin runtime** at the NestJS-module + Prisma-schema level
- **Compile-time plugin composition** — plugins are npm packages added
  at build time via `plugins.config.ts`
- **Three communication channels:** sync hooks (in-process, budgeted),
  async events (BullMQ), strategy interfaces (replace/extend specific
  operations)
- **Frontend slots** — Next.js App Router stays in kernel; plugins
  register React components for named slots at build time
- **Single-tenant** — one Postgres database, one set of products, one
  set of users

## Out of scope (deferred indefinitely)

### Multi-tenant plugin enabling

ShopVerse is single-tenant in v1. Plugins are enabled platform-wide via
`plugins.config.ts` at build time. If multi-tenant arrives in a future
major version, the migration path is:

- Replace the build-time `plugins.config.ts` with a runtime
  `tenant_plugins` table (per-tenant enable/disable)
- Add a `tenantId` AsyncLocalStorage context that the plugin loader
  reads to decide enable status per request
- Plugin schemas grow a `tenantId` column for data isolation
- Cross-tenant data access requires explicit kernel methods

The in-process plugin loader and the SDK contract remain unchanged.
This is intentionally NOT designed today — premature multi-tenant
support is a common over-engineering trap.

### Microservice extraction

Per plan §1, microservices are explicitly NOT the v1 target. If a
future requirement (multi-team scaling, multi-cloud, regulatory data
isolation) forces extraction:

- The plugin boundary is already the natural extraction seam
- A plugin that becomes a microservice keeps its SDK contract;
  the SDK adapter becomes an HTTP/gRPC client
- Kernel ⇄ plugin communication that was async via BullMQ becomes
  network — minimal kernel code changes

This is documented as a future possibility, not a v1 commitment.

### Plugin sandboxing (third-party trust model)

Plugins run in the same Node process as the kernel. A malicious or
buggy plugin can `process.exit(1)`, read environment variables, read
arbitrary files. There is NO sandboxing.

This is by design for v1:
- First-party plugins are kernel-maintainer-reviewed
- Third-party plugins are treated as trusted code (npm install equivalent)
- Operators who need stronger isolation must enforce it at container
  level: distinct pods per plugin, NetworkPolicy egress restrictions,
  Linux user separation, AppArmor/SELinux profiles

The SDK provides defense-in-depth via authz scopes (E12) but cannot
prevent a malicious plugin from circumventing the SDK entirely.

### Runtime plugin install / uninstall

Plugins are installed at build time, not at runtime. To add a plugin,
edit `plugins.config.ts` and redeploy. To remove, vice versa.

This trades the WordPress-style "click to install" convenience for:
- Reproducible builds (the same image always loads the same plugins)
- No runtime plugin loader (smaller attack surface)
- Easier debugging (the plugin list at boot is the plugin list forever)

### Plugin marketplace UI

A user-facing marketplace (browse, install, configure) is out of scope.
First-party plugins live in this repo's docs (`docs/plugins/index.md`).
Third-party plugins are discovered via npm.

### Per-plugin Postgres permissions

All plugins share the same Postgres user and connection pool. Per-plugin
DB users (with `GRANT SELECT ... TO plugin_user`) would enforce stronger
isolation but require operator-side configuration that's out of scope
for v1.

### Multi-cloud / multi-region deployment

Covered by `docs/runbooks/multi-region.md`. Plugin behaviour in a
multi-region deployment follows the same patterns as the kernel:
events stay regional, the cron-leader-election rules apply, plugin
state is in the regional Postgres.

---

## Why "out of scope" matters

Saying NO clearly is more valuable than saying yes vaguely:

- Contributors don't waste time on multi-tenant abstractions today
- Reviewers can reject PRs that creep into out-of-scope territory
- Operators know what to expect (and what not to)
- The roadmap doesn't accumulate ambiguous commitments

If your use case requires anything in the "out of scope" list, talk to
the maintainer about commercial consulting OR fork — those are legitimate
choices, not failure modes.
