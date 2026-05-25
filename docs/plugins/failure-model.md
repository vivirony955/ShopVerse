# Plugin Failure Model

How ShopVerse handles plugin failures. Plan reference: §6.

## Three states per plugin per hook

```
   enabled ──→ breaker-open ──→ (cooldown 60s) ──→ half-open
       ↑              │                                  │
       │              │                                  ↓
       │              └─────────────────── success ──── closed
       │
       └──── operator-disabled (Redis kill switch, set via admin endpoint)
```

| State | Sync hooks | Async events | Strategies |
|---|---|---|---|
| `enabled` | Run with budget | Run with retry | Used in normal composition |
| `breaker-open` | Skip + log WARN | BullMQ retries continue (independent) | Fall back to kernel default (if available) |
| `operator-disabled` | Skip silently | Skip silently | Fall back to kernel default (if available) |

## Per extension type — fallback policy

| Extension type | Plugin missing | Plugin failing (breaker open) | Plugin operator-disabled | Plugin slow (timeout) |
|---|---|---|---|---|
| **Sync pre-validation hook** | Skip silently | Skip + WARN + breaker | Skip silently + audited | Timeout → skip + WARN |
| **Sync post-commit hook** | Skip silently | Skip + WARN + breaker | Skip silently + audited | Timeout → skip + WARN |
| **Async event consumer** | Skip silently | BullMQ retry (3×), then DLQ | Skip; messages queue and consume when re-enabled | n/a (long timeout) |
| **Payment strategy** | Kernel default (Stripe) | 503 to user + alert | 503 to user + alert | Timeout → 503 |
| **Fraud signal strategy** | `score = 0` | `score = 0`, log WARN | `score = 0` | Timeout → `score = 0` |
| **Coupon discount strategy** | Core types only | Core types only + WARN | Core types only | n/a (sync) |
| **Shipping carrier strategy** | Manual entry in admin | 503 to user | 503 to user | Timeout → 503 |
| **Invoice format strategy** | Kernel default format | Kernel default + WARN | Kernel default | Timeout → kernel default |

## Operator surfaces

When a plugin breaks:

- **Sentry:** every breaker-open event creates an issue tagged with
  `plugin: <id>`
- **Prometheus alert:** `rate(shopverse_plugin_breaker_open_total[5m]) > 0`
- **Admin UI:** `/admin/plugins` lists every plugin's current state,
  last failure timestamp, last failure message, p95 latency for the
  last 24h, and exposes a "Disable" button (audited)
- **Logs:** structured `{level:"warn", plugin:"<id>", reason:"<msg>",
  state:"breaker-open"}`

## CircuitBreaker semantics

State machine implemented in `backend/src/common/circuit-breaker.ts`:

```
threshold       : 5 consecutive failures within 60s   → open
cooldown        : 60s in open → half-open
half-open trial : next 1 call goes through;
                  success → closed
                  failure → open (cooldown resets)
```

Per plugin × per hook. So a plugin's `order.preValidate` breaker is
independent of its `cart.beforeReserve` breaker — one failing hook
doesn't disable other hooks of the same plugin.

## What "failure" means

| Hook type | Failure trigger |
|---|---|
| Sync hook | Thrown exception OR timeout (100ms for pre-validation, 50ms post-commit) |
| Async event | Thrown exception (after BullMQ's own retry budget) OR timeout (30s) |
| Strategy | Thrown exception OR timeout (configurable per strategy, default 5s) |

A returned `RejectReason` from a pre-validation hook is NOT a failure —
it's the contract working as intended. The breaker counts unexpected
exceptions, not legitimate rejections.

## Operator override (Redis kill switch)

To disable a plugin without redeploying:

```bash
curl -X POST -H "Authorization: Bearer <admin-token>" \
  https://shopverse.example.com/api/admin/plugins/@shopverse/price-alerts/disable

# Verify in admin UI: state should show "operator-disabled"
```

To re-enable:
```bash
curl -X POST -H "Authorization: Bearer <admin-token>" \
  https://shopverse.example.com/api/admin/plugins/@shopverse/price-alerts/enable
```

Both actions are audited via `kernel.audit.log()` — they appear in the
`AdminAuditLog` table with the operator's user id.

## Audit log entries

| Event | Entry |
|---|---|
| Breaker opens | `{ action: 'plugin.breaker_opened', plugin, hook, reason }` |
| Breaker closes | `{ action: 'plugin.breaker_closed', plugin, hook }` |
| Operator disables | `{ action: 'plugin.disabled', plugin, userId }` |
| Operator enables | `{ action: 'plugin.enabled', plugin, userId }` |
| Plugin load fails at boot | `{ action: 'plugin.boot_failed', plugin, error }` |

## Plugin authors: how to be a good citizen

- Throw early and clearly. The breaker can't distinguish a programmer
  error from an infrastructure failure.
- Set timeouts on outbound calls inside your hook. The kernel will
  enforce its own timeout, but yours should be tighter.
- Use `kernel.logger.warn(...)` for non-fatal issues; the kernel's
  log scrubber masks PII automatically.
- Don't catch and silently swallow exceptions inside your hook — that
  hides failures from the breaker AND from your monitoring.
