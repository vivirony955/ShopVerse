# Plugin Author Guide

This guide is for contributors writing a ShopVerse plugin. If you want
the 10-minute "build a thing" walkthrough, read
[tutorial.md](tutorial.md) first.

## Mental model

A plugin is a small NestJS DynamicModule (and optionally a small
React module) that the kernel loads at boot. The kernel pulls plugins
from the manifest at `backend/plugins.config.ts`. The plugin reaches
the kernel through `@shopverse/sdk`; the kernel reaches the plugin
through hooks, events, strategies, and slots.

```
   backend/plugins.config.ts
            │
            ▼
   resolvePluginModules() ──► AppModule.imports
            │                       │
            ▼                       ▼
   <PluginName>PluginModule    HookRunner / EventBus / StrategyRegistry
            │                                                    │
            ▼                                                    ▼
   *Bootstrap (OnApplicationBootstrap)                    plugin handlers
   - hooks.register(...)
   - crons.register(...)
   - events.subscribe(...)
   - strategies.register(...)
```

The plugin's own controllers / services / Prisma models live alongside
the bootstrap. Plugin frontend code (slots) lives under
`frontend/src/plugins/<name>/` for first-party plugins (or in the
npm package's `frontend/` entry for third-party).

## Required files

A minimal plugin under `backend/plugins/<name>/`:

```
package.json          # name, version, peer deps on @shopverse/sdk
tsconfig.json
src/
  index.ts            # public exports (PluginModule + optional plain Plugin object)
  <name>.module.ts    # NestJS @Module + <Name>Bootstrap
  <name>.service.ts   # @Injectable
  <name>.controller.ts # optional — @Controller('plugin/<id-tail>')
test/
  smoke.spec.ts       # boots kernel + plugin (or rely on integration spec)
```

Prisma model (if any): `prisma/schema/<name>.prisma` at the repo
root — see [database.md](database.md) for the FK and migration rules.

Manifest entry in `backend/plugins.config.ts`:

```ts
{
  id: '@shopverse/plugin-<name>',
  source: 'workspace',
  workspacePath: './plugins/<name>',
  enabled: true,
  kernelVersion: '0.1.0-alpha.1',
}
```

## Picking your extension points

| You want to... | Use |
|---|---|
| Reject an order based on custom rules | `order.preValidate` hook |
| Send an email / clear a cache / refresh CDN after an order ships | `order.delivered` event subscriber |
| Add Razorpay as a payment option | `PaymentGatewayStrategy` (mode `single`) |
| Add a new fraud-signal feature to the risk score | `FraudSignalStrategy` (mode `composable`) |
| Add a stackable discount type | `DiscountStrategy` (mode `chained`) |
| Add a custom widget to the PDP | frontend slot at `pdp.afterDescription` or `pdp.beforeAddToCart` |
| Schedule a periodic job (≤ 1 per plugin, ≥ 5 min interval) | `kernel.crons.register(...)` |
| Run a heavy background workload | `kernel.queues.register(...)` (your own BullMQ queue) |
| Store plugin settings the operator can edit | `kernel.config.get/set` |
| Need to audit-log an admin action | `kernel.audit.log({ ... })` |

The full surface is in [sdk-reference.md](sdk-reference.md).

## What you MUST NOT do

The lint rules in `@shopverse/eslint-plugin-shopverse` catch most of
this automatically:

| Violation | Lint rule | Why |
|---|---|---|
| `import from '@backend/*'` | `no-kernel-import` | Plugin can't reach kernel internals; use SDK |
| `prisma.$transaction(async (tx) => { hookRunner.run(...) })` | `no-hook-in-tx` | Hooks must never run inside a kernel transaction (latency + correctness) |
| Two Prisma queries in one sync hook | `no-multi-prisma-in-hook` | Sync hooks have a 1-query budget |
| `@Controller('orders')` (no `plugin/` prefix) | `plugin-route-prefix` | Plugin routes must be namespaced under `/api/plugin/...` |
| Schema has `userId Int` but no `user.beforeDelete` registered | `user-before-delete-required` | GDPR/DPDP erasure must work across plugins |
| `import('./Widget')` in a frontend plugin | `no-runtime-dynamic-import` | Slots are compile-time |
| `fetch()` / `prisma.x.find(...)` in a slot component | `slot-no-data-fetch` | Slots are pure render functions |

See [conventions.md](conventions.md) for the full rule list +
configuration.

## Boot order in the kernel

1. `AppModule` is constructed — `resolvePluginModules(pluginsConfig)`
   runs synchronously and returns the array of plugin modules.
2. NestJS instantiates the dependency graph. Plugin
   `<Name>PluginModule` providers register; `<Name>Bootstrap`
   instances are constructed but their `onApplicationBootstrap` has
   NOT yet been called.
3. `NestFactory.create(AppModule)` resolves; before opening the HTTP
   listener, Nest invokes every `onApplicationBootstrap` in
   registration order — that's where each plugin calls
   `hooks.register`, `crons.register`, `events.subscribe`, etc.
4. HTTP / worker listeners open. Plugin code is now live.

If your `onApplicationBootstrap` throws, the plugin is skipped (plan
§10 E4) — the boot log records `ERROR` with the cause, the rest of
the kernel keeps booting, and `/admin/plugins` shows your plugin as
failed.

## Local development loop

```bash
# After editing plugin source:
cd backend && npx tsc --noEmit              # type check
cd backend && npm run start:dev             # dev server with HMR

# After editing schema:
npx prisma validate --schema prisma/schema
npx prisma generate --schema prisma/schema
npx prisma migrate dev --schema prisma/schema --name <descriptive-name>

# Integration spec at test/<plugin>.spec.ts:
cd test && npx jest <plugin> --runInBand --forceExit
```

When you flip `enabled: false` in `plugins.config.ts` and restart,
the plugin's routes return 404 and its hooks / crons never fire. The
W1.T20 Redis kill-switch (`POST /admin/plugins/:id/disable`) gives
you the same disable without a redeploy.

## Common patterns

### Pattern 1: Event subscriber that refetches its own data

```ts
// my-plugin.module.ts
@Injectable()
export class MyOrderListener implements OnApplicationBootstrap {
  constructor(
    private readonly eventBus: EventBus,
    private readonly prisma: PrismaService,
  ) {}

  onApplicationBootstrap() {
    this.eventBus.subscribe('order.placed', async (event) => {
      const order = await this.prisma.order.findUnique({
        where: { id: event.orderId },
        include: { items: { include: { variant: true } } },
      });
      if (!order) return;
      await this.doSomethingWith(order);
    });
  }
}
```

This is the standard shape for non-financial post-order side effects:
re-fetch what you need, do the work, swallow no errors silently.
BullMQ retries on throw with exp backoff.

### Pattern 2: Strategy that adds to a kernel-defined chain

```ts
// my-discount.strategy.ts
export class StudentDiscount implements DiscountStrategy {
  readonly id = 'student-discount';
  apply(ctx: DiscountContext): DiscountResult {
    if (!ctx.user.isStudent) return { type: 'noop' };
    return {
      type: 'percent',
      pct: 5,
      reason: 'Student verification active',
    };
  }
}

// my-plugin.module.ts onApplicationBootstrap:
kernel.strategies.register(new StudentDiscount(), 'chained', 50);
```

Mode + priority are validated at registration; collisions throw at
boot (plan §10 E21).

### Pattern 3: Slot component bound to a kernel page prop

```tsx
// frontend/src/plugins/my-plugin/Widget.tsx
'use client';
import { t } from '@shopverse/sdk-frontend';

export function MyWidget({ productId }: { productId: number }) {
  return <div>{t('my.cta', 'Buy together')}</div>;
}

// frontend/src/plugins/my-plugin/index.ts
export const slots: SlotRegistration[] = [{
  pluginId: '@shopverse/plugin-my-name',
  name: 'pdp.afterDescription',
  component: MyWidget as never,
  minHeight: 64,
}];
```

The kernel page emits `<Slot name="pdp.afterDescription" productId={p.id} />`
and your widget receives `productId` as a prop. See
[slots.md](slots.md) for the 12-slot taxonomy.

## When you get stuck

- Look at `backend/plugins/price-alerts/` — that's the pilot, it
  exercises every contract.
- Check [failure-model.md](failure-model.md) if your plugin is
  failing silently — the CircuitBreaker may have opened.
- Check `/admin/plugins` for runtime state once that page lands
  (W6.T3).
- Open an issue with the `plugin` label and link your manifest +
  the boot log.
