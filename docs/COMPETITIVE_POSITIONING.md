# Competitive Positioning

> Where does ShopVerse stand against the platforms operators already
> know? This is a comparison based on publicly documented behaviour +
> the things we can measure. Not a marketing pitch.

ShopVerse is a **source-available, correctness-first, region-pluggable
commerce platform for any market**. Currency, tax, payment, address, and
locale are store-configured and extended per region via plugins — there
is no hardcoded geography in the kernel. That position drives every
comparison below: when something is a fair fight, we say so; when we
don't compete, we say so too.

---

## TL;DR scoreboard

| Dimension | Shopify | Medusa | Saleor | WooCommerce | Magento | **ShopVerse** |
|---|---|---|---|---|---|---|
| **Source-available** | ❌ | ✅ MIT | ✅ BSD-3 | ✅ GPL | ⚠️ (OSS ed. paused 2024) | **✅ BSL → Apache-2.0** |
| **Free for production self-host** | ❌ | ✅ | ✅ | ✅ | ❌ (Adobe Commerce paid) | **✅ under $100k/yr GMV** |
| **DB-enforced financial invariants** | partial (admin tooling) | ❌ | ❌ | ❌ | ❌ | **✅ I-1..I-13 + ledger** |
| **Double-entry wallet ledger** | ❌ | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Race-safe inventory (conditional `UPDATE`)** | ✅ (proprietary) | ⚠️ partial | ⚠️ partial | ❌ | ❌ | **✅ reservation + atomic** |
| **Multi-warehouse routing** | Add-on (Fulfillment Network) | Plugin | ✅ | Plugin | ✅ (MSI) | **✅ kernel** |
| **Region packs (tax/payment/locale)** | ❌ (paid apps) | ❌ | ❌ | ❌ | ❌ | **✅ pluggable** |
| **Pluggable gateway per region** | partial (Stripe et al.) | Plugin | Custom | Plugin | Plugin | **✅ `PaymentGatewayStrategy`** |
| **Plugin model with isolation** | App Bridge (sandboxed iframe) | Modules (in-process) | Apps (webhook) | `$hooks` (in-process) | Extensions (in-process) | **✅ in-process + CircuitBreaker + scopes** |
| **Batteries-included storefront + admin** | ✅ | ❌ (headless) | ❌ (headless) | ✅ | ✅ | **✅** |
| **a11y CI gate (axe-core)** | unknown | unknown | unknown | unknown | unknown | **✅ enforced** |
| **Bundle / hydration budgets in CI** | partial (theme limits) | n/a | n/a | n/a | n/a | **✅ 50 kB / 80 kB per page** |
| **Tests against a real DB** | n/a (closed) | unit only | 500+ | manual | manual | **✅ 1,180+** |
| **Open public-API spec** | ✅ | ✅ | ✅ GraphQL | partial | ✅ | **✅ OpenAPI + per-plugin tagged** |

Legend: ✅ supported · ⚠️ partial / caveats · ❌ not supported

The wedge in one line: **enforced correctness + batteries-included
operations + a region-pluggable kernel** — at zero license cost until
you're a real business ($100k/yr GMV).

---

## Detailed comparisons

### vs Shopify (the platform prospects name first)

The most-named competitor for any commerce pitch. **This is the
comparison most prospects will draw.**

| What | Shopify | ShopVerse |
|---|---|---|
| Hosting model | Hosted SaaS | Self-hosted (your infra) |
| Monthly cost | $29 / $79 / $399 + per-txn fee | infra cost only |
| Plus tier | $2,300+/mo for cohort analytics, scripting, advanced flows | included by default |
| Multi-warehouse | Fulfillment Network (limited regions) | kernel, any region |
| Tax / payment / locale per market | paid apps + Shopify Payments | region packs + `TaxStrategy` / `PaymentGatewayStrategy` |
| Custom plugins | App Store (paid, reviewed, sandboxed iframe) | source-available plugin model |
| Code ownership | none — Shopify's | yours, BSL (→ Apache-2.0) |
| Bring your own DB | ❌ | ✅ (Postgres) |
| Financial correctness | trusted to Shopify's internals | DB-enforced I-1..I-13 + double-entry ledger |
| OpenAPI spec | ✅ | ✅ full, per-plugin tagged |

**Where Shopify wins:**

- 0-to-store-in-a-day. ShopVerse needs the QUICKSTART setup (a
  scaffolder is on the roadmap).
- A vast theme + app marketplace.
- 24/7 support from Shopify staff.
- Search + autocomplete polished over a decade.

**Where ShopVerse wins:**

- **Cost at scale.** Past ~$1k/mo of Shopify spend (subscription + txn
  fees + apps — a tier you outgrow fast), ShopVerse's infra cost is flat
  while Shopify scales with revenue. And it's **free to run under $100k/yr
  GMV** — you only pay once you're a real business.
- **Correctness you can audit.** Overselling and double-refunds are
  impossible by construction (see below), not a black box you trust.
- **No vendor lock-in.** Your code, your DB, your data. Walk away with a
  `pg_dump` whenever.
- **Global on your terms.** Currency/tax/payment/locale are store config;
  a region pack swaps regional behavior without forking the kernel.

### vs Medusa (the modern headless OSS engine)

Medusa is the closest philosophical competitor: Node/TypeScript,
modular, MIT-licensed, strong community momentum.

| What | Medusa | ShopVerse |
|---|---|---|
| Stack | TypeScript + Postgres | TypeScript + Postgres |
| Shape | **Headless** — you build the storefront + admin | **Batteries-included** — storefront, admin, ops included |
| Financial invariants | application-level | **DB-enforced I-1..I-13** |
| Double-entry ledger | ❌ | ✅ |
| Multi-warehouse | plugin / module | kernel |
| Region behavior | regions exist; tax/gateway are integrations | **region packs** bundle tax + payment + locale as one plugin |
| Extension isolation | in-process modules | CircuitBreaker per-plugin per-hook + scopes |
| Ecosystem | larger, funded, more integrations | smaller, first-party + scaffolder |

**Where Medusa wins:** bigger ecosystem and community, headless
flexibility for a fully custom frontend, more third-party integrations,
commercial backing.

**Where ShopVerse wins:** you get a working storefront + admin + finance
+ analytics on day one instead of assembling them; **correctness is
enforced at the database**, not left to application code; double-entry
wallet ledger and maker-checker refunds are built-in, not bolt-ons.

### vs Saleor (GraphQL-first OSS commerce)

Saleor is mature, GraphQL-native, and enterprise-deployed.

| What | Saleor | ShopVerse |
|---|---|---|
| Core stack | Python / Django | TypeScript end-to-end |
| API | GraphQL-first | OpenAPI (REST) + per-plugin specs |
| Shape | headless | batteries-included |
| Financial invariants | application-level | DB-enforced I-1..I-13 + ledger |
| Footprint | heavier (Django + GraphQL infra) | tuned hot path, Redis where it matters |

**Where Saleor wins:** GraphQL API surface, enterprise maturity, large
contributor base, deep i18n.

**Where ShopVerse wins:** one language end-to-end (contributors don't
need Python), enforced financial correctness, double-entry ledger, and a
lighter operational footprint.

### vs WooCommerce

The reigning self-hosted champion, riding WordPress's content empire.

| What | WooCommerce | ShopVerse |
|---|---|---|
| Stack | PHP + MySQL (via WordPress) | TypeScript + Postgres |
| Architecture | global `$hooks` bus (WP Action / Filter) | typed hooks + events + strategies |
| Plugin model | runtime-loaded, often in-process races | manifest + CircuitBreaker + scopes |
| Financial invariants | manual | I-1..I-13 enforced |
| Inventory race conditions | documented in the wild for years | conditional `updateMany` + reservation model |
| Plugin developer DX | powerful but undocumented contract | typed SDK + lint + tutorial + scaffolder |

**Where WooCommerce wins:** discoverability (WordPress builders drop it
in), theme + tutorial economy, sheer plugin count.

**Where ShopVerse wins:**

- **Correctness.** WooCommerce inventory race conditions are a documented
  bug class for a decade. ShopVerse's conditional reservation + atomic
  `updateMany` + I-1/I-2 invariants make that class impossible by design.
- **Plugin isolation.** A bad WooCommerce plugin can break the store.
  ShopVerse's CircuitBreaker isolates failures per-plugin per-hook and
  auto-falls-back.
- **Performance budgets enforced in CI** — bundle 50 kB, hydration 80 kB.
  WooCommerce has none.

### vs Magento (now Adobe Commerce)

Magento dominated mid-market commerce 2008–2018; Adobe then bought it and
paused the Open Source edition in late 2024.

| What | Magento / Adobe Commerce | ShopVerse |
|---|---|---|
| Stack | PHP + MySQL | TypeScript + Postgres |
| Licensing | OSS ed. paused; Adobe Commerce paid | BSL, source-available, free under $100k GMV |
| Multi-warehouse | ✅ (Inventory MSI) | ✅ kernel |
| Multi-store | ✅ (built for it) | single-tenant; multi-tenant deferred (plan §10 E14) |
| Performance | heavy without aggressive caching | tuned hot path; Redis cache where it matters |
| TypeScript | ❌ | ✅ end-to-end |

**Where Magento wins:** maturity, module count, multi-store.

**Where ShopVerse wins:** modern stack, lighter footprint, contributors
don't need PHP/MySQL, and kernel correctness enforced through I-1..I-13.

### vs Amazon (the benchmark, not a platform you adopt)

**Amazon is not a fair competitor for ShopVerse.** Amazon is a
trillion-dollar marketplace with proprietary infrastructure tuned over 25
years; ShopVerse is a self-hostable platform for ONE operator's
storefront. You don't "choose Amazon-the-infrastructure" — but operators
benchmark against it, so:

| What | Amazon | ShopVerse | Honest verdict |
|---|---|---|---|
| Catalog browse latency (p95) | ~200 ms global | <80 ms local; ~200 ms on a small VPS | About equal at small scale; Amazon wins at planet scale |
| Multi-warehouse fulfilment | continent-scale | configured per operator | Different problems |
| Fraud / risk scoring | ML, billions of signals | rule + score composition via plugin strategies | Amazon wins coverage; ShopVerse wins explainability |
| Refunds | wallet (Amazon Pay) + card | double-entry wallet + pluggable gateway | About equal mechanism; ShopVerse is auditable |
| Marketplace network effects | 300M+ customers | 0 — it's YOUR store | Different products |
| Cost to operator | ~15% commission | self-hosting cost only | ShopVerse wins for sufficiently large stores |

A seller paying ~15% marketplace commission can run a D2C storefront on
ShopVerse for the cost of their infrastructure. Below the point where
commission exceeds infra + engineering cost, Amazon's network effects and
zero-ops dominate; above it, the margin recovery pays for the operational
overhead.

---

## Where ShopVerse legitimately falls short

Honest list. These are open work items, not pitch gaps:

1. **No 0-to-store wizard yet.** Operators go through QUICKSTART manually.
   A `create-shopverse-store` scaffolder is on the roadmap.
2. **No theme economy.** Storefront is one Tailwind theme + slot
   extensions; Shopify has thousands of paid themes.
3. **No mobile app for shoppers.** Web-only. → roadmap.
4. **Single-tenant.** Multi-tenant is out of scope for v1 (plan §10 E14 +
   `docs/architecture/scope.md`). Adobe Commerce and Shopify Plus have
   multi-store; ShopVerse doesn't — yet.
5. **Plugin marketplace.** Plugins are first-party (in-repo) or
   third-party (npm); there's no curated marketplace UI like Shopify's
   App Store. Region-pack [bounties](../BOUNTIES.md) are how the long tail
   gets built.
6. **24/7 support.** Self-host means self-operate. Operators need an
   oncall person; Shopify gives you theirs.
7. **Region-pack coverage is early.** `shopverse-india` (flat GST) and
   `shopverse-us` (per-state sales tax) ship today; most markets still
   need a pack built (the bounty program targets exactly this).
8. **Lighthouse / k6 runtime gates self-skip** until a staging URL is
   provisioned operator-side. The gates are scaffolded; activation is an
   operator step.

---

## Where the scoreboard is unfair

Calibration notes for anyone reading this:

1. **Source-available is not free of cost** — operators pay in ops time.
   Self-hosting on a single VPS is cheap; running a production-grade
   ShopVerse deployment costs the same engineering attention as any other
   monolith.

2. **ShopVerse hasn't been battle-tested at Shopify / Amazon scale**
   because no operator has put a Shopify-sized store on it yet. The
   architecture targets high single-region GMV based on the `bench/`
   numbers; we've not run a real customer at that volume. Healthy
   skepticism welcome.

3. **The competitors aren't standing still.** Shopify ships AI features
   quarterly; Medusa and Saleor iterate fast; Adobe Commerce is
   rebuilding cloud-native. These comparisons are correct as of late
   2026 — revisit annually.

---

## Picking ShopVerse vs not

A decision tree from the operator's perspective:

```
Are you a single-store operator (not a marketplace / multi-tenant SaaS)?
├─ No → ShopVerse is the wrong fit (yet)
└─ Yes
    │
    Is your annual GMV high enough that a developer's effort pays off
    (roughly approaching/over $100k/yr, or a Shopify bill > ~$1k/mo)?
    ├─ No → Shopify Basic — better ergonomics until you scale
    └─ Yes
        │
        Do you have a developer (in-house or contracted)?
        ├─ No → Shopify Plus; the ops tax of self-host will hurt
        └─ Yes
            │
            Is owning your code + data worth real engineering effort?
            ├─ No → Shopify Plus
            └─ Yes
                │
                Does a region pack exist for your market — or will you
                build/commission one (it's a bounty)?
                ├─ Yes → ShopVerse is a strong fit
                └─ Unsure → ShopVerse still works on store-configured
                            defaults; a pack just makes tax/locale exact
```

The honest answer for most prospects: **if you don't have an engineering
function and your GMV is small, Shopify is the right answer.** ShopVerse
wins when you have a developer, want to own your stack, are scaling past
the point where SaaS fees bite — and you value correctness you can prove
rather than trust.

---

## See also

- [README.md](../README.md) — what ShopVerse is + Feature Overview
- [SYSTEM_DESIGN_FINAL.md](../SYSTEM_DESIGN_FINAL.md) — the architectural
  detail behind the claims above
- [LICENSE](../LICENSE) — BSL 1.1, the $100k GMV grant, Apache-2.0
  conversion
- [BOUNTIES.md](../BOUNTIES.md) — get paid to build region packs +
  gateways for your market
- [docs/plugins/](plugins/) — the extension model claim, with source
  pointers
