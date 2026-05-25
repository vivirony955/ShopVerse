# Kernel / Plugin Boundary

This document defines the **non-removable kernel**, the **kernel modules
that expose extension strategies**, and the **plugin candidates** for
ShopVerse. It is the source of truth for "what can be replaced vs what
cannot." Plan reference: §3.

The boundary is informed by three signals from the codebase analysis:

1. **Coupling depth.** Services injected into 5+ other modules
   (PrismaService at 41×, EmailService at 6×) are kernel by gravity.
2. **Invariant ownership.** Modules that own one of the 13 named
   financial invariants (I-1 through I-13) are kernel by safety.
3. **Replaceability without rewrite.** Modules with zero non-Prisma
   cross-module dependencies (blog, price-alerts, etc.) are plugin
   candidates by structure.

---

## Tier 1 — Kernel (never replaceable)

These 13 modules form the immovable core. Plugins MAY consume them via
the SDK; plugins MAY NOT replace, fork, or shadow them.

| Module | Why kernel |
|---|---|
| `prisma` | DB access; 41× injection — universal dependency |
| `common` (Redis, CronLock, ErrorTracking, InvariantValidator) | Infrastructure utilities; framework-level |
| `auth` | Identity + authorization — security boundary; never plugin code |
| `users` | Identity store; referenced by every module |
| `products`, `categories`, `brands` | Catalog primitives; referenced by every order and every plugin |
| `cart` + `cart-reservation` | Inventory contention; narrow transaction window owners |
| `orders` | Order lifecycle state machine; owner of I-5 |
| `payments` | Stripe integration + webhook idempotency (I-6) |
| `wallet` | Double-entry ledger; owns I-3, I-4, I-7, I-11, I-12 |
| `inventory` | Owns I-1, I-2 |
| `warehouse` | Multi-warehouse routing; future-critical |
| `email` | Transactional delivery; 6× injection — too cross-cutting to plug |
| `observability` (tracing, metrics, scrubber, MetricsController) | Security-sensitive PII scrubbing; cross-cutting |

**Rule:** any code change in these 13 modules requires a CHANGELOG entry
and goes through the kernel maintainers (defined in `.github/CODEOWNERS`).

---

## Tier 2 — Core-extended (kernel modules with strategy interfaces)

These 6 modules stay in the kernel but expose interfaces in the SDK.
Plugins register implementations of those interfaces to extend behaviour.
Kernel composes the implementations per strategy mode (see plan §10 E21).

| Module | Strategy interface | Mode | Use case |
|---|---|---|---|
| `coupons` | `DiscountStrategy` | chained | Add discount types beyond %/flat/cashback |
| `fraud` | `FraudSignalStrategy` | composable | Plugins add risk signals; kernel sums scores |
| `loyalty` | `EarnRuleStrategy` | chained | Plugins add point-earning rules |
| `delivery` | `ShippingCarrierStrategy` | single | One carrier wins per shipment (Shiprocket, Delhivery, Ekart, etc.) |
| `invoices` | `InvoiceFormatStrategy` | single | Plugins add invoice templates per jurisdiction |
| `payments` | `PaymentGatewayStrategy` | single | Plugins add Razorpay / PhonePe / PayU alongside Stripe |

**Rule:** the strategy interface in `@shopverse/sdk` is the source of
truth. Adding a new method to a strategy interface is a SemVer minor.
Removing a method requires a deprecation cycle (one major version with
both names).

---

## Tier 3 — Pluggable (independent extensions)

These 16 modules either already have zero non-Prisma coupling today, or
have very narrow coupling (one event subscriber, one strategy
registration). They will be progressively migrated to `backend/plugins/`
in Waves 2 and 4.

| Module | Current coupling | Migration wave |
|---|---|---|
| `price-alerts` | zero (kernel + own table) | W2 (pilot) |
| `blog` | zero | W4 |
| `price-history` | zero | W4 |
| `volume-discounts` | zero | W4 |
| `notifications` | one event subscriber (`order.placed`) | W4 |
| `referral` | one event subscriber + uses loyalty | later |
| `abandoned-cart` | two events; uses email | later |
| `flash-sales` | subscribes to `product.viewed`; admin pages | later |
| `support` | admin-only module | later |
| `affiliate` | subscribes to `order.placed`; UTM tracking | later |
| `legal` | content-only (policies, cookie consent) | later |
| `faqs` | content-only | later |
| `qa` | content-only (PDP Q&A) | later |
| `reviews` | PDP-facing; could be replaceable | later |
| `wishlist` | user-data extension | later |
| `experience` | save-for-later, delivery slots, gift options | later |
| `analytics` | read-only event consumer | later |

**Rule:** a plugin's only allowed kernel imports are from
`@shopverse/sdk`. ESLint rule `no-kernel-import` enforces this. The
plugin's Prisma schema lives in its own file under `prisma/schema/`
and MUST NOT add foreign keys to kernel tables.

---

## What changes between today and Wave 6

| Aspect | Today | After Wave 6 |
|---|---|---|
| File layout | All 38 modules in `backend/src/` | Kernel + core-extended in `backend/src/`; first-party plugins in `backend/plugins/`; third-party from `node_modules/@shopverse/plugin-*` |
| Cross-module imports | Direct (`import { WalletService } from '../wallet/...'`) | Plugins use `@shopverse/sdk` only |
| Schema | One `schema.prisma` | `prisma/schema/kernel.prisma` + one file per plugin |
| Migration order | One linear chain | Kernel first, then plugins in `plugins.config.ts` declared order |
| Event flow | Direct service-to-service + `.catch(() => {})` for fire-and-forget | EventBus (BullMQ) for cross-plugin + external; HookRunner for kernel-internal sync |
| Boot | Single entrypoint | Same entrypoint; manifest loader registers plugins after kernel ready |

---

## Anti-patterns to refuse during code review

- A kernel module importing from a plugin → reject, this would couple
  the kernel to a removable module
- A plugin importing from `@backend/*` (anything except `@shopverse/sdk`)
  → reject, lint rule catches this
- A plugin adding a FK to a kernel table in its schema → reject
- A plugin running its own `prisma.$transaction` in a sync hook → reject
- A plugin calling another plugin via direct import → reject (use the
  plugin-to-plugin event channel)
- Adding a new strategy interface to the SDK without a use case in
  master plan → reject, contract bloat is permanent

---

## Reviewers

| Tier | Required reviewer |
|---|---|
| Tier 1 (kernel) | Kernel maintainer (see `.github/CODEOWNERS`) |
| Tier 2 (core-extended) | Kernel maintainer for SDK changes; module maintainer for impl changes |
| Tier 3 (pluggable) | Plugin maintainer (defined in plugin's own `CODEOWNERS`) |
