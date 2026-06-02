# @shopverse/sdk-frontend

Browser-safe SDK exports for ShopVerse frontend plugins.
Source-available under [Business Source License 1.1](./LICENSE).

> **Status:** v0.1.0-alpha. Pre-stable. Contract surface evolves
> alongside `@shopverse/sdk`.

## Overview

ShopVerse plugins that ship UI (slot components) consume this
package for browser-safe contracts that the backend `@shopverse/sdk`
shouldn't pull into the client bundle. Today the surface is small
and grows on demand:

- `t(key, defaultEn)` — i18n placeholder. Returns `defaultEn` today
  (W5.T4 / plan §10 E16); becomes locale-aware in a future wave
  without a plugin code change.

Future additions (rolled in as W5+ requires them):

- `registerSlot` re-export — currently lives in
  `frontend/src/lib/slots.ts` of the host repo
- Frontend API client registration (`registerApi('priceAlertsApi', …)`)
- Slot type helpers per plan §4 frontend extension model
- JSON-LD registry re-export

## Install

```bash
npm install @shopverse/sdk-frontend
```

The package is **runtime-dependency-free** — it ships only TypeScript
and runtime stubs that are safe in both React Server Components and
client components. No React peer dep is required for the day-1 i18n
helper; future additions that touch React will document peer-dep
requirements at that time.

## Usage

```ts
import { t } from '@shopverse/sdk-frontend';

export function PriceAlertCta() {
  return <button>{t('plugin.priceAlerts.cta', 'Notify me on price drop')}</button>;
}
```

## License

[Business Source License 1.1](./LICENSE). You can build commercial products
on top of ShopVerse; you cannot host ShopVerse as a managed service
to third parties.
