# @shopverse/sdk

Typed contracts for ShopVerse plugins. Source-available under
[Elastic License 2.0](../../LICENSE).

> **Status:** v0.1.0-alpha. Pre-stable. Contract surface evolves until
> v0.2.0 ships in the main ShopVerse repo.

## Overview

ShopVerse plugins consume this SDK to interact with the kernel.
Plugins NEVER import from `@backend/*` — only from
`@shopverse/sdk`. This is the boundary that makes plugins safely
removable and the kernel safely refactorable.

The SDK exports four kinds of contracts:

1. **Hooks** — sync extension points the kernel calls at specific
   moments. 5 day-1 hooks: `order.preValidate`, `order.afterPlace`,
   `cart.beforeReserve`, `payment.afterCapture`, `user.beforeDelete`.
2. **Events** — async pub/sub via BullMQ. 10 day-1 events covering
   orders, payments, wallet, cart, user, catalog.
3. **Strategies** — interfaces plugins implement to replace or extend
   specific operations. 3 day-1 strategies:
   `PaymentGatewayStrategy`, `FraudSignalStrategy`, `DiscountStrategy`.
4. **Plugin lifecycle** — `ShopVersePlugin` interface with
   `onRegister`, `onConfigure`, `onReady`, `onShutdown` hooks.

## Install

```bash
npm install @shopverse/sdk
```

(Until first npm publish, link locally:)

```bash
npm install file:../../packages/sdk
```

## Hello, World

```typescript
import { ShopVersePlugin, OrderPlacedEvent } from '@shopverse/sdk';

export const myPlugin: ShopVersePlugin = {
  id: '@example/hello-world',
  version: '0.1.0',
  kernelVersion: '^0.1.0',

  async onRegister(kernel) {
    kernel.events.subscribe('order.placed', async (event: OrderPlacedEvent) => {
      kernel.logger.log(`Hello! Order ${event.orderId} was placed.`);
    });
  },
};
```

Then register it in your ShopVerse repo's `plugins.config.ts`:

```typescript
export default {
  kernelVersion: '0.2.0',
  plugins: [
    { id: '@example/hello-world', source: 'workspace', workspacePath: './my-plugin', enabled: true },
  ],
};
```

## Documentation

Full contract reference + tutorial lives in the main repo at:
- `docs/architecture/kernel-boundary.md` — what's kernel vs plugin
- `docs/plugins/failure-model.md` — error handling + breakers
- `docs/plugins/tutorial.md` — build your first plugin (W6)

## Roadmap

- v0.1.0-alpha: skeleton contracts (you are here)
- v0.1.0: stable contracts after W1 ships
- v0.2.0: production-ready after W6 ships

## License

Elastic License 2.0. Free for non-commercial use; commercial use
requires a paid license from the maintainer.
