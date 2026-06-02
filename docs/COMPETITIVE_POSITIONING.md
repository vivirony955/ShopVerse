# Competitive Positioning

> Where does ShopVerse stand against the platforms shoppers and
> store operators already know? This is a comparison based on
> publicly documented behaviour + the things we can measure.
> Not a marketing pitch.

ShopVerse is **source-available infrastructure for warehouse-driven
D2C commerce in India**. That position drives every comparison
below — when something is a fair fight, we say so; when we don't
compete, we say so too.

---

## TL;DR scoreboard

| Dimension | Amazon | Shopify | Magento (Adobe) | WooCommerce | **ShopVerse** |
|---|---|---|---|---|---|
| **Source-available** | ❌ | ❌ | ⚠️ (Open Source ed. paused 2024) | ✅ | **✅ BSL** |
| **Multi-warehouse routing** | ✅ (proprietary) | Add-on (Shopify Fulfillment Network) | ✅ (Adobe Commerce) | Plugin | **✅ kernel** |
| **Financial invariants enforced in DB** | ✅ | partial (admin tooling) | partial | manual | **✅ I-1..I-13 + ledger** |
| **Double-entry wallet ledger** | ✅ | ❌ | ❌ | ❌ | **✅** |
| **Indian payment rails (UPI, COD)** | ✅ | ⚠️ (Stripe India only) | partial | plugin | **✅ Stripe IN + COD** |
| **Plugin model with isolation** | n/a (closed) | App Bridge (sandboxed iframe) | Extensions (in-process) | Plugins (in-process) | **✅ in-process + CircuitBreaker + scopes** |
| **a11y CI gate (axe-core)** | unknown | unknown | unknown | unknown | **✅ enforced** |
| **Bundle / hydration budgets** | n/a | partial (theme limits) | n/a | n/a | **✅ 50 kB / 80 kB per page** |
| **Cohort analytics + funnel + finance** | ✅ | $$ ("Shopify Plus") | ✅ | plugin | **✅ kernel** |
| **GDPR/DPDP cross-plugin erasure** | ✅ | ✅ | partial | manual | **✅ user.beforeDelete hook** |
| **Self-host without licensing fees** | ❌ | ❌ | ❌ (Magento → Adobe Commerce paid) | ✅ | **✅ BSL non-managed** |
| **Open public-API spec** | partial | ✅ | ✅ | partial | **✅ OpenAPI + per-plugin OpenAPI** |

Legend: ✅ supported · ⚠️ partial / caveats · ❌ not supported · $$ paid tier

---

## Detailed comparisons

### vs Amazon (the standard everyone benchmarks)

**Amazon is not a fair competitor for ShopVerse.** Amazon is a
trillion-dollar marketplace with proprietary infrastructure tuned
over 25 years; ShopVerse is a self-hostable platform for ONE
operator's storefront. Compare on what's comparable:

| What | Amazon | ShopVerse | Honest verdict |
|---|---|---|---|
| Catalog browse latency (p95) | ~200 ms global | <80 ms local; ~200 ms on a small India-region VPS | About equal at small scale; Amazon wins at planet scale |
| Multi-warehouse fulfilment | continent-scale | configured per operator | Different problems |
| Fraud / risk scoring | ML-driven, billions of signals | rule + score composition with plugin strategies | Amazon wins on coverage; ShopVerse wins on explainability |
| Returns | 7-day default + Prime exceptions | 7-day configurable | About equal |
| Refunds | wallet (Amazon Pay) + card | wallet + Stripe | About equal |
| Marketplace network effects | 300M+ customers | 0 — it's YOUR store | Different products |
| Cost to operator | 15% commission | self-hosting cost only | ShopVerse wins for sufficiently large stores |

**Where ShopVerse genuinely competes vs Amazon Seller-Hub:**

A seller currently on Amazon paying 15% commission can run a D2C
storefront on ShopVerse for the cost of their infrastructure. The
math tips toward ShopVerse around ₹3 Cr GMV/year for a typical
India-region deployment (single-region VPS + Postgres + Stripe
fees). Below that, Amazon's network effects + zero-ops cost
dominate. Above that, the margin recovery pays for the engineering
operations overhead.

### vs Shopify

The most-named competitor for a D2C platform pitch. **This is
the comparison most prospects will draw.**

| What | Shopify | ShopVerse |
|---|---|---|
| Hosting model | Hosted SaaS | Self-hosted (or your hosting) |
| Monthly cost | $29 / $79 / $299 + 2% txn fee | infra cost only |
| Plus tier | $2000+ / month for cohort analytics, advanced flash sales | included by default |
| Multi-warehouse | Shopify Fulfillment Network (US-only) | included by default, India-first |
| UPI in India | via Stripe India only | direct |
| Cash on Delivery | via paid app | kernel |
| Custom plugins | App store (paid, reviewed) | source-available plugin model |
| Code ownership | none — Shopify's | yours, BSL |
| Bring your own DB | ❌ | ✅ (Postgres) |
| OpenAPI spec | partial | full, per-plugin tagged |

**Where Shopify wins:**

- 0-to-store-in-a-day. ShopVerse needs the QUICKSTART setup.
- A vast theme + app marketplace.
- 24/7 support from Shopify staff.
- Search + autocomplete that's been polished for a decade.

**Where ShopVerse wins:**

- **Cost at scale.** Past ~$1k/mo on Shopify (the "small" tier you
  outgrow fast), ShopVerse's infra cost is flat while Shopify
  scales linearly with revenue + add-ons.
- **India-native payment + delivery.** UPI, COD, pincode-based
  serviceability, multi-warehouse routing, Indian FY invoice
  sequencing — all kernel, not paid add-ons.
- **No vendor lock-in.** Your code, your DB, your data. Walk away
  with a `pg_dump` whenever.
- **Plugin author DX.** Source-available means contributors can
  audit + extend without sandbox-iframe gymnastics.

### vs Magento (now Adobe Commerce)

Magento dominated mid-market commerce 2008–2018, then Adobe bought
it and paused the Open Source edition in late 2024.

| What | Magento / Adobe Commerce | ShopVerse |
|---|---|---|
| Stack | PHP + MySQL | TypeScript + Postgres |
| Licensing | Open Source paused; Adobe Commerce $$ | BSL, source-available |
| Multi-warehouse | ✅ (Inventory MSI) | ✅ kernel |
| Multi-store | ✅ (built for it) | single-tenant; multi-tenant deferred (plan §10 E14) |
| Module ecosystem | thousands | starting (5 first-party + scaffolder) |
| Performance | notoriously heavy without aggressive caching | tuned hot path; Redis cache where it matters |
| TypeScript | ❌ | ✅ end-to-end |

**Where Magento wins:** maturity, module count, multi-store.

**Where ShopVerse wins:** modern stack, lighter footprint,
contributors don't need PHP/MySQL expertise, kernel correctness
enforced through I-1..I-13 invariants.

### vs WooCommerce

The reigning self-hosted champion, riding WordPress's content
empire.

| What | WooCommerce | ShopVerse |
|---|---|---|
| Stack | PHP + MySQL (via WordPress) | TypeScript + Postgres |
| Architecture | global $hooks bus (WP Action / Filter) | typed hooks + events + strategies |
| Plugin model | runtime-loaded, often in-process race conditions | compile-time + manifest + CircuitBreaker |
| Financial invariants | manual | I-1..I-13 enforced |
| Multi-warehouse | plugin | kernel |
| Inventory race conditions | known historical issue | conditional `updateMany` + reservation model + W6.T-flakes ongoing audit |
| Plugin developer DX | WP hooks: powerful but undocumented contract | typed SDK + lint + tutorial + scaffolder |

**Where WooCommerce wins:**

- Discoverability — WordPress site builders can drop in WooCommerce.
- Theme economy + tutorial economy.
- Sheer plugin count.

**Where ShopVerse wins:**

- **Correctness.** WooCommerce inventory race conditions are
  documented in the wild for a decade. ShopVerse's conditional
  reservation + atomic `updateMany` + I-1/I-2 invariants make the
  same class of bug impossible-by-design.
- **Plugin isolation.** A bad WooCommerce plugin can break the
  store. ShopVerse's CircuitBreaker isolates failures per-plugin
  per-hook + auto-falls-back.
- **Performance budgets enforced in CI.** Bundle 50 kB,
  hydration 80 kB, SSR slot 50 ms, k6 < 5% Δ. WooCommerce has none
  of these.

---

## Where ShopVerse legitimately falls short

Honest list. These are open work items, not pitch gaps:

1. **No 0-to-store wizard.** Operators still go through QUICKSTART
   manually. Shopify's setup wizard is genuinely good; ShopVerse
   doesn't have one yet. → roadmap item.
2. **No theme economy.** Storefront is one Tailwind theme + slot
   extensions. Shopify has thousands of themes for purchase.
3. **No mobile app for shoppers.** Web-only. → roadmap item.
4. **Single-tenant.** Multi-tenant is documented as out of scope
   for v1 (plan §10 E14 + `docs/architecture/scope.md`). Adobe
   Commerce and Shopify-Plus both have multi-store; ShopVerse
   doesn't — yet.
5. **Plugin marketplace.** Today plugins are first-party (in the
   repo) or third-party (npm). There's no curated marketplace UI
   like Shopify's App Store.
6. **24/7 support.** Self-host means self-operate. Operators
   running ShopVerse need an oncall person; Shopify gives you
   theirs.
7. **Lighthouse / k6 runtime activation.** The gates are
   scaffolded (W5.T10, W6.T2) but the CI workflows self-skip until
   a staging URL is provisioned operator-side. Same pattern as
   most CI/CD setups, but explicit in our case.
8. **Per-plugin V8 heap snapshot.** Plan §5 #8 says ≤ 10 MB idle.
   Today's check is a raw-source proxy (W6.T1); a real
   child-process orchestrator that measures RSS is a follow-on if
   any plugin ever trips the proxy.

---

## Where the scoreboard is unfair

Three calibration notes for anyone reading this:

1. **Source-available is not free of cost** — operators pay in
   ops time. Self-hosting on a single-region VPS is cheap; running
   a real production-grade ShopVerse deployment costs the same
   engineering attention as running any other monolith.

2. **ShopVerse hasn't been battle-tested at Shopify / Amazon scale**
   because no operator has put a Shopify-sized store on it yet.
   The architecture targets ₹50 Cr / month single-region GMV
   based on the bench/ numbers; we've not run a real customer
   through that volume. Healthy skepticism welcome.

3. **The competitors aren't standing still.** Shopify's been
   shipping AI features quarterly; Adobe Commerce has been
   rebuilding for cloud-native. The comparisons above are correct
   as of late 2026; revisit annually.

---

## Picking ShopVerse vs not

A decision tree from the operator's perspective:

```
Are you a single-store D2C operator?
├─ No (marketplace, multi-tenant) → ShopVerse is wrong for you (yet)
└─ Yes
    │
    Is your monthly GMV > ₹50 lakh (~$60k)?
    ├─ No → Shopify Basic ($29/mo) — better ergonomics until you scale
    └─ Yes
        │
        Do you have a developer (in-house or contracted)?
        ├─ No → Shopify Plus or stay on Shopify Basic; the ops tax of self-host kills you
        └─ Yes
            │
            Is "owning your code + data" worth real engineering effort to you?
            ├─ No → Shopify Plus
            └─ Yes
                │
                Do you operate in India OR plan to?
                ├─ Yes → ShopVerse is the strongest fit
                └─ No → ShopVerse works, but Magento / Saleor / Medusa are
                         also worth a serious look in your region
```

The honest answer for most prospects: **if you don't have an
engineering function and your GMV is < $1M/year, Shopify is the
right answer**. ShopVerse wins when one of those constraints
flips.

---

## See also

- [README.md](../README.md) — what ShopVerse is + Feature Overview
- [SYSTEM_DESIGN_FINAL.md](../SYSTEM_DESIGN_FINAL.md) — the
  architectural detail behind the claims above
- [USER_GUIDE.md](USER_GUIDE.md) — what shoppers + operators
  experience
- [docs/plugins/](plugins/) — the extension model claim, with
  source pointers
