# ShopVerse Plugins — Catalog

First-party plugins ship in this repository under `backend/plugins/`
and (where the plugin includes UI) under `frontend/src/plugins/`.
They are loaded through `backend/plugins.config.ts` at boot time.

Third-party plugins install from npm and live in
`backend/node_modules/@shopverse/plugin-<name>` /
`frontend/node_modules/@shopverse/plugin-<name>`. The loader treats
both sources identically.

## First-party plugin catalog

| Plugin | Location | Status | What it does |
|---|---|---|---|
| `@shopverse/plugin-price-alerts` | [backend/plugins/price-alerts/](../../backend/plugins/price-alerts) + [frontend/src/plugins/price-alerts/](../../frontend/src/plugins/price-alerts) | shipped (W2 pilot) | Per-user price-drop alerts; PDP slot widget at `pdp.beforeAddToCart`; hourly cron |
| `@shopverse/plugin-blog` | [backend/plugins/blog/](../../backend/plugins/blog) | shipped (W4) | Blog post CRUD + author pages; registers `user.beforeDelete` for GDPR/DPDP |
| `@shopverse/plugin-price-history` | [backend/plugins/price-history/](../../backend/plugins/price-history) | shipped (W4) | Daily price snapshots per variant; midnight cron via `PluginCronRegistry` |
| `@shopverse/plugin-volume-discounts` | [backend/plugins/volume-discounts/](../../backend/plugins/volume-discounts) | shipped (W4) | Bulk-quantity discount rules; pure CRUD, no kernel coupling |
| `@shopverse/plugin-notifications` | [backend/plugins/notifications/](../../backend/plugins/notifications) | shipped (W4) | Per-user in-app notification feed; pure CRUD |

The pilot (`price-alerts`) is the canonical example of a plugin that
exercises every contract type: hook (`user.beforeDelete`), cron, REST
controller, AND a frontend slot. The other four exercise narrower
contracts and are good for studying focused patterns.

## Looking for a contract reference?

| What you want | Go to |
|---|---|
| Build your first plugin | [tutorial.md](tutorial.md) |
| Full author guide | [guide.md](guide.md) |
| Every SDK hook / event / strategy | [sdk-reference.md](sdk-reference.md) |
| Lint rules + PR checklist | [conventions.md](conventions.md) |
| Database schema rules | [database.md](database.md) |
| Authz scopes + audit log | [security.md](security.md) |
| Bundle / perf budgets | [performance.md](performance.md) |
| a11y rules for slots | [a11y.md](a11y.md) |
| i18n for plugin strings | [i18n.md](i18n.md) |
| Failure isolation model | [failure-model.md](failure-model.md) |
| Frontend slot taxonomy | [slots.md](slots.md) |

## Tier boundary

Three tiers per [kernel-boundary.md](../architecture/kernel-boundary.md):

1. **Kernel** (Tier 1) — non-removable, plan §3 names the 12 modules.
   Plugins extend it via hooks/events/strategies but cannot replace it.
2. **Core-extended** (Tier 2) — kernel modules that expose strategy
   interfaces. Today: payments, fraud, loyalty, delivery, invoices,
   coupons.
3. **Pluggable** (Tier 3) — fully removable. The first-party catalog
   above lives here. Three more first-party Tier-3 candidates from
   plan §3 are not yet extracted: `support`, `affiliate`, `legal`,
   `faqs`, `qa`, `reviews`, `wishlist`, `experience`, `analytics`,
   `flash-sales`, `abandoned-cart`, `referral`.

The non-extracted Tier-3 candidates still live in `backend/src/`; they
can be migrated later using the W4 pattern (move → schema split →
manifest entry → integration spec) without breaking the plugin ABI.
