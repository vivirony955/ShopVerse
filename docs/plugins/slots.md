# Plugin Slots — Author Guide

> Compile-time React slot system for the ShopVerse storefront and
> admin. Plugins register components into named extension points;
> the kernel emits `<Slot name="..." />` at each location.

## The 12 slots

| Slot name | Renders at | Kernel page | Server-component-safe? |
|---|---|---|---|
| `nav.beforeUserMenu` | Navbar, before profile dropdown | `components/layout/Navbar.tsx` | ❌ navbar is client |
| `pdp.afterDescription` | PDP, after the description block | `app/(shop)/products/[id]/ProductDetailClient.tsx` | ❌ client (PDP gallery is interactive) |
| `pdp.priceWidget` | PDP price area (replaceable) | same as above | ❌ client |
| `pdp.beforeAddToCart` | PDP, immediately above the Add-to-Cart button | same as above | ❌ client |
| `plp.beforeFilters` | PLP, above filter rail | `app/(shop)/products/page.tsx` | ✅ server |
| `cart.afterItems` | Cart drawer, below line items | `components/cart/CartSidebar.tsx` | ❌ client |
| `cart.beforeCheckout` | Cart drawer, above checkout CTA | same as above | ❌ client |
| `checkout.beforePaymentMethod` | Checkout, above payment selector | `app/(shop)/checkout/page.tsx` | ❌ client (Stripe Elements) |
| `checkout.afterAddress` | Checkout, after the address picker | same as above | ❌ client |
| `orders.afterSummary` | Order detail page, after summary card | `app/(shop)/orders/[id]/page.tsx` | ✅ server |
| `profile.afterTabs` | Profile page, custom tab | `app/(shop)/profile/page.tsx` | ✅ server |
| `admin.afterDashboard` | Admin home, custom card | `app/(shop)/admin/page.tsx` | ✅ server (admin gate is server-side) |

A slot is added by editing both `frontend/src/lib/slots.ts` (the
`SlotName` union + `ALL_SLOT_NAMES` array) and the kernel page that
emits it. Adding a slot is therefore a kernel concern, not a plugin
concern — plugins consume the existing 12 and request new slot names
through an RFC issue.

## Authoring a slot component

```tsx
// backend/plugins/<my-plugin>/frontend/index.ts
import type { SlotRegistration } from '@/lib/slots';
import { MyWidget } from './MyWidget';

export const slots: SlotRegistration[] = [
  {
    pluginId: '@shopverse/plugin-my-plugin',
    name: 'pdp.afterDescription',
    component: MyWidget,
    priority: 100,  // lower = renders first; default 100
    minHeight: 64,  // px reserved even when plugin is disabled (CLS shield)
  },
];
```

The build-time codegen reads `plugins.config.ts`, finds each enabled
plugin with a `frontend/index.ts`, and emits a single
`frontend/src/generated/slot-registrations.ts` that flattens all
registrations into `ALL_PLUGIN_SLOTS`.

## Hard rules (enforced + reviewed)

### 1. Pure render functions
A slot component receives props from the kernel page and renders. It
MUST NOT:

- Call `fetch()`, Prisma, or any data source inside the component
  body. The kernel page is responsible for fetching; if your slot
  needs data, request it as a prop (and propose the prop addition to
  the kernel page's existing `<Slot>` invocation).
- Push state to global stores (Redux, Zustand) that the kernel page
  doesn't own.
- Mutate `document` / `window` directly outside of `useEffect`.

### 2. RSC default, opt into `'use client'` only when needed
If your component can render as a React Server Component (no hooks,
no event handlers, no browser APIs), DO NOT add `'use client'`. The
table above identifies which slots require client components
(navbar, cart drawer, checkout, PDP) — for those slots you can
freely use `'use client'`. For server-safe slots (PLP, orders, profile,
admin), staying server-only is required to avoid contributing to
hydration weight (W5.T6 / plan §10 E18: ≤ 80KB per page).

### 3. Bundle size ≤ 50KB per plugin per page (W5.T2 / plan §5 #6)
Minified, after tree-shaking. The CI bundle-budget gate enforces
this; over-budget plugins fail the merge.

### 4. SSR render ≤ 50ms (W5.T3 / plan §5 #7)
Per slot, per render. If your component does heavy formatting,
memoize. If it depends on a third-party SDK that runs at module
init, lazy-load. Dev/CI warns when a slot exceeds 50ms; production
builds skip the timing instrumentation.

### 5. Declare a `minHeight` for every slot that can be visually empty (W5.T8 / plan §10 E20)
The kernel's `<Slot>` wraps your component in a `min-height` div
sized to the max of all registered `minHeight` values. When your
plugin is disabled mid-rollout, edge-cached pages render an empty
placeholder of the right height — no CLS spike. Pick a value that
bounds the typical rendered size: too small → CLS when plugin
re-enables, too large → wasted whitespace when plugin disabled. A
60–120px range covers most widgets; price-widget replacements should
match the kernel widget's height.

### 6. JSON-LD types: register through the registry (W5.T7 / plan §10 E19)
The kernel already emits Product, Brand, Offer, AggregateOffer,
AggregateRating, Organization, FAQPage, Question, Answer,
BreadcrumbList, ListItem. Plugins MUST call
`registerSchemaType(typeName, pluginId)` from
`frontend/src/lib/jsonld-registry.ts` at module-init; collisions
throw at startup so plugin smoke tests catch them before production
traffic does.

### 7. a11y: no axe violations of severity ≥ "serious" (W5.T5 / plan §10 E17)
The CI gate runs `jest-axe` against every registered slot in jsdom.
Specifically:

- Semantic HTML — no `<div>` with `role="button"` and no tabindex
- Focus management — slot inserted in a modal must not trap focus
  inside itself
- Honor `prefers-reduced-motion` for any animation
- `aria-label` on every icon-only button

### 8. i18n strings via `t(key, defaultEn)` (W5.T4 / plan §10 E16)
Use `import { t } from '@shopverse/sdk-frontend'`. Today `t()`
returns `defaultEn` unconditionally (i18n is a future wave); the
forward-compat call shape ensures plugins are translatable later
without a code change.

### 9. No runtime dynamic imports for slot components
Plugins are compile-time slots, not runtime loaders. Use `import`
statements; never `import()`. Bundle splitting is the build's job.

## Lifecycle of a slot registration

```
plugins.config.ts (manifest)
        │
        │  enabled: true + has frontend/index.ts
        ▼
build-time codegen
        │
        │  produces frontend/src/generated/slot-registrations.ts
        ▼
frontend/src/lib/slots.ts (eager init)
        │
        │  calls registerSlot() for each entry
        ▼
<Slot name="..." /> renders
        │
        │  getSlot(name) returns registrations sorted by priority
        ▼
React composes the component tree
```

When `enabled: false`, the codegen omits the plugin's registrations
entirely → `<Slot>` finds zero matches → renders the min-height
placeholder div. The kernel page is unaware that a plugin was
disabled — exactly the contract we want.

## Disabling a slot for a single request

Slots are compile-time only; there is no per-request disable. The
plan §10 E2 Redis kill-switch covers BACKEND plugin disable, but
frontend slot registration is part of the bundle. If you need to
disable a plugin's UI for a subset of users (e.g. feature flag),
implement the gate INSIDE the plugin's slot component
(`if (!flag.enabled) return null;`) so the kernel boundary stays
plugin-agnostic.

## See also

- `docs/plugins/failure-model.md` — backend failure isolation
- `docs/architecture/kernel-boundary.md` — what kernel owns vs what plugins extend
- `frontend/src/lib/slots.ts` — slot registry source
- `frontend/src/components/Slot.tsx` — `<Slot>` implementation
- `frontend/src/lib/jsonld-registry.ts` — JSON-LD type registry
