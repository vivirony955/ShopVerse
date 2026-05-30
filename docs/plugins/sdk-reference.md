# `@shopverse/sdk` reference

Source: [packages/sdk/src/contracts/](../../packages/sdk/src/contracts/).
This page lists the public surface; the source is authoritative.

> SemVer applies to this surface from v0.2.0 onward; v0.1.x is
> pre-stable. Adding a hook/event/strategy is a minor bump; removing
> or renaming is major. See [conventions.md](conventions.md) for
> deprecation policy.

## Hooks (5)

Sync extension points the kernel calls at specific moments. Each
runs through `HookRunner` with a per-hook budget and a per-plugin
CircuitBreaker. Source: [hooks.ts](../../packages/sdk/src/contracts/hooks.ts).

| Hook name | Phase | Budget | Reject? | Context |
|---|---|---|---|---|
| `order.preValidate` | before `$transaction` in `placeOrder` | 100 ms | yes — return `RejectReason` to abort with 400 | userId, cart, address, warehouseContext |
| `order.afterPlace` | after commit, before HTTP response | 50 ms | no — failures logged + skipped | orderId, userId, warehouseContext |
| `cart.beforeReserve` | before reservation INSERT | 100 ms | yes | userId, cart, warehouseContext |
| `payment.afterCapture` | after webhook `processed=true` | 50 ms | no | orderId, paymentIntentId, amount |
| `user.beforeDelete` | before kernel deletes a user row | 100 ms | yes (aborts deletion + audit-logs) | userId |

Plan §4 Type 1/2 properties apply: at most 1 Prisma query per sync
hook, NEVER inside `$transaction`. Lint rules `no-hook-in-tx` and
`no-multi-prisma-in-hook` (W1.T8/T11) enforce both.

## Events (12)

Async pub/sub via BullMQ topic `shopverse-events`. Multiple consumers
can subscribe to the same event; ordering is NOT guaranteed across
consumers. Default retry: 5 attempts, exp backoff 5 s. Source:
[events.ts](../../packages/sdk/src/contracts/events.ts).

| Event name | Published from | Payload key fields |
|---|---|---|
| `order.placed` | `OrdersService.placeOrder` (post-tx) | orderId, userId, total, paymentMethod |
| `order.cancelled` | `OrdersService.cancelOrder` | orderId, userId, reason |
| `order.delivered` | `OrdersService.updateOrderStatus → DELIVERED` | orderId, userId, total |
| `payment.captured` | `PaymentsService.handleWebhook → payment_intent.succeeded` | orderId, paymentIntentId, amount, gateway |
| `payment.failed` | `payment_intent.payment_failed` | orderId, paymentIntentId, reason, gateway |
| `payment.refunded` | `charge.refunded` (or in-app refund) | orderId, refundRequestId? , amount, gateway |
| `wallet.credited` | `WalletService.credit` | userId, amount, reference |
| `wallet.debited` | `WalletService.debit` | userId, amount, reference |
| `cart.abandoned` | abandoned-cart cron | userId, cartSnapshotId, total |
| `user.registered` | `AuthService.register` | userId, email |
| `product.priceChanged` | catalog mutation paths | productId, prevPrice, newPrice |
| `inventory.lowStock` | inventory reservation paths | variantId, warehouseId, stock |

Plugins MAY also publish their own namespaced topics via
`eventBus.publishCustom('<plugin-id>.<event-name>', payload)`.
Plugin-to-plugin contracts are NOT versioned by the SDK.

## Strategies (6)

Plugins implement an interface; the kernel registers and dispatches
according to the strategy's mode. Source:
[strategies.ts](../../packages/sdk/src/contracts/strategies.ts).

| Strategy | Mode | When kernel calls |
|---|---|---|
| `PaymentGatewayStrategy` | single (one per gateway id) | `createIntent` at checkout; `handleWebhook` per gateway route |
| `FraudSignalStrategy` | composable (all run, scores summed) | pre-order risk check |
| `DiscountStrategy` | chained (priority order, each can modify running total) | cart apply / order totalise |
| `ShippingCarrierStrategy` | single (per carrier id) | `getRates` at checkout; `createShipment` at fulfilment |
| `EarnRuleStrategy` | composable | loyalty earn on delivered order |
| `InvoiceFormatStrategy` | single (per jurisdiction id) | invoice render |

Plan §10 E21 strategy modes are enforced at registration. See
[W1.T32 strategy-registry](../../backend/src/common/) for the
mechanism.

## Plugin lifecycle (4 hooks)

```ts
export interface ShopVersePlugin {
  id: string;
  version: string;
  kernelVersion: string;       // semver peer-dep

  onRegister?(kernel: KernelContext): void | Promise<void>;
  onConfigure?(env: NodeJS.ProcessEnv): void | Promise<void>;
  onReady?(): void | Promise<void>;
  onShutdown?(): void | Promise<void>;
}
```

Source: [plugin.ts](../../packages/sdk/src/contracts/plugin.ts). For
first-party plugins that use NestJS DynamicModule (the W2 pivot)
this lifecycle is implemented by a `*Bootstrap` provider that
implements `OnApplicationBootstrap` — see
[backend/plugins/price-alerts/src/price-alerts.module.ts](../../backend/plugins/price-alerts/src/price-alerts.module.ts)
for the canonical pattern.

## `KernelContext`

Passed to `onRegister`. Surfaces (per W1.T17, with later additions):

| Field | Use |
|---|---|
| `kernel.hooks.register(name, handler)` | register a hook handler |
| `kernel.events.subscribe(event, consumer)` | subscribe to a typed kernel event |
| `kernel.events.publishCustom(topic, payload)` | publish a plugin-owned event |
| `kernel.events.subscribeCustom(topic, consumer)` | subscribe to another plugin's event |
| `kernel.strategies.register(impl, mode, priority?)` | register a strategy |
| `kernel.db` | semaphore-wrapped Prisma client (per-plugin concurrency cap) |
| `kernel.crons.register({ name, interval, handler })` | declare a cron |
| `kernel.queues.register({ name, concurrency, processor })` | own a BullMQ queue |
| `kernel.api.registerRoutes(controllerClass, { tag })` | register routes into OpenAPI |
| `kernel.config.get(key)` / `.set(key, value)` | persistent plugin config |
| `kernel.audit.log({ action, target, userId? })` | append to AdminAuditLog |
| `kernel.scopes` | per-plugin authz scope check (throws on missing) |
