# Tutorial: Build "Hello, World" in 10 minutes

This walkthrough builds the `@shopverse/plugin-hello-world` plugin
from scratch using only `@shopverse/sdk`. It exercises four
contracts: a hook, an event subscriber, a strategy stub, and a
frontend slot. At the end you can `enabled: false` the plugin in
`plugins.config.ts` and the kernel boots and serves traffic without
it.

> **Source:** [backend/plugins/hello-world/](../../backend/plugins/hello-world)
> ships in the repo. This tutorial walks through what you'd write
> from scratch; reading the shipped source side-by-side helps.

## Prerequisites

- Node 22+
- Postgres 16 running locally (see [QUICKSTART.md](../../QUICKSTART.md))
- This repository cloned and `npm install` run in `backend/`

## Step 1 — Scaffold the plugin package (1 min)

Create the directory and stub files:

```bash
mkdir -p backend/plugins/hello-world/src
mkdir -p backend/plugins/hello-world/test
mkdir -p frontend/src/plugins/hello-world
```

`backend/plugins/hello-world/package.json`:

```json
{
  "name": "@shopverse/plugin-hello-world",
  "version": "0.1.0-alpha.1",
  "private": true,
  "description": "Tutorial plugin — exercises every contract type.",
  "license": "Elastic-2.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "peerDependencies": {
    "@shopverse/sdk": "^0.1.0-alpha.1"
  }
}
```

`backend/plugins/hello-world/tsconfig.json`: copy from price-alerts.

## Step 2 — A NestJS DynamicModule with a bootstrap (2 min)

`backend/plugins/hello-world/src/hello-world.module.ts`:

```ts
import { Injectable, Module, OnApplicationBootstrap } from '@nestjs/common';
import { EventBus } from '../../../src/common/event-bus.service';
import { HookRunner } from '../../../src/common/hook-runner.service';

const PLUGIN_ID = '@shopverse/plugin-hello-world';

@Injectable()
class HelloWorldBootstrap implements OnApplicationBootstrap {
  constructor(
    private readonly hooks: HookRunner,
    private readonly eventBus: EventBus,
  ) {}

  onApplicationBootstrap() {
    // Hook: observe (don't reject) on cart reserves
    this.hooks.register('cart.beforeReserve', PLUGIN_ID, async (ctx) => {
      if (ctx.cart.items.length === 0) return undefined;
      console.log(`[hello-world] cart.beforeReserve fired for user ${ctx.userId}`);
      return undefined; // never reject — this is just observation
    });

    // Event subscriber: log orders the kernel publishes
    this.eventBus.subscribe('order.placed', PLUGIN_ID, async (event) => {
      console.log(`[hello-world] order #${event.orderId} placed`);
    });
  }
}

@Module({
  providers: [HelloWorldBootstrap],
})
export class HelloWorldPluginModule {}
```

(Both `hooks.register` and `eventBus.subscribe` take the plugin id
as the second argument — that's what gets attached to OTel spans
and Prometheus metric labels.)

`backend/plugins/hello-world/src/index.ts`:

```ts
export { HelloWorldPluginModule } from './hello-world.module';
```

## Step 3 — Register in the manifest (30 sec)

Add to `backend/plugins.config.ts`:

```ts
{
  id: '@shopverse/plugin-hello-world',
  source: 'workspace',
  // Points at the directory holding the plugin's NestJS module —
  // that's `src/`, not the package root. The resolver loads
  // `<workspacePath>/index.ts` (or `index.js`) as the plugin entry.
  workspacePath: './plugins/hello-world/src',
  enabled: true,
},
```

(`kernelVersion` is a manifest-root field, not per-plugin — see the
top of `plugins.config.ts`. Each plugin's peer-dep on the SDK is
declared in its own `package.json`.)

Run `cd backend && npm run start:dev`. The boot log should show:

```
[Nest] LOG [InstanceLoader] HelloWorldPluginModule dependencies initialized
[hello-world] HelloWorldBootstrap onApplicationBootstrap
```

Place a test order via the storefront — the order.placed log fires.

## Step 4 — Add a frontend slot (3 min)

`frontend/src/plugins/hello-world/HelloWidget.tsx`:

```tsx
'use client';
import { t } from '@shopverse/sdk-frontend';

export function HelloWidget({ productId }: { productId: number }) {
  return (
    <p className="text-sm text-violet-600">
      {t('hello.cta', `👋 Hello from a plugin — product #${productId}`)}
    </p>
  );
}
```

`frontend/src/plugins/hello-world/index.ts`:

```ts
import type { SlotRegistration } from '@/lib/slots';
import { HelloWidget } from './HelloWidget';

export const slots: SlotRegistration[] = [
  {
    pluginId: '@shopverse/plugin-hello-world',
    name: 'pdp.afterDescription',
    component: HelloWidget as never,
    minHeight: 24,
  },
];
```

Wire into `frontend/src/generated/slot-registrations.ts`:

```ts
import { slots as helloSlots } from '@/plugins/hello-world';

export const ALL_PLUGIN_SLOTS: SlotRegistration[] = [
  ...priceAlertsSlots,
  ...helloSlots,
];
```

Run `cd frontend && npm run build`. Navigate to a PDP — the violet
greeting renders below the description.

## Step 5 — Verify the boundary (1 min)

Flip the manifest entry to `enabled: false`. Rebuild. Restart the
backend. The PDP shows no greeting (the slot wrapper renders an
empty placeholder); the backend boot log shows
`Plugin @shopverse/plugin-hello-world disabled in manifest — skipping`.
Orders still place fine. That's the plugin contract working.

Flip back to `enabled: true`. Done.

## What you just did

- Wrote a NestJS DynamicModule with a Bootstrap provider
- Registered a sync hook (`cart.beforeReserve`) — observation only
- Subscribed to an async event (`order.placed`) — fires on each new order
- Wired a frontend slot at `pdp.afterDescription` — pure render with `t()` for i18n-ready strings
- Verified the plugin removes cleanly via manifest flag

## Next steps

- **Add a strategy** — pick `FraudSignalStrategy` (composable mode).
  Read [sdk-reference.md](sdk-reference.md) for the contract; the
  fraud module composes scores from every registered strategy.
- **Own Prisma data** — drop a `HelloEvent` model into
  `prisma/schema/hello-world.prisma`. Read [database.md](database.md)
  for the FK / migration rules.
- **Add an admin route** — `@Controller('plugin/hello-world')` +
  `kernel.api.registerRoutes(...)` so the routes appear under the
  Plugin: Hello group in `/api/docs/openapi.json`.
- **Author a real test** — `test/hello-world.spec.ts` boots the
  kernel + plugin and asserts the hook fires.

Then run `cd test && npx jest --runInBand --forceExit`. Suite stays
green; you shipped a plugin.
