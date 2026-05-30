# Plugin Performance + Observability

Plan §5 hard rules + §6 attribution. Every number on this page is a
CI gate.

## Budgets table

| # | Rule | Cap | Gate |
|---|---|---|---|
| 1 | Hook handler MUST NOT run inside `prisma.$transaction` | n/a | ESLint `no-hook-in-tx` (W1.T8) |
| 2 | Sync pre-validation hook | 100 ms | `HookRunner.runSync` Promise.race + CircuitBreaker (W1.T10/T15) |
| 3 | Sync post-commit hook | 50 ms | same |
| 4 | Async event handler | 30 s | BullMQ `lockDuration` (W3.T9) |
| 5 | Max 1 Prisma query per sync hook | 1 | Prisma middleware counts per ALS context (W1.T11) |
| 6 | Frontend plugin bundle per page | 50 KB | `npm run bundle:check` (W5.T2) |
| 7 | SSR slot wrapper render | 50 ms | `<Slot>` dev warn (W5.T3) |
| 8 | Plugin memory footprint idle | 10 MB | W6.T1 (pending) |
| 9 | Plugin cron count + interval | 1, ≥ 5 min | Manifest validator (W1.T12) |
| 10 | Plugin Prisma connection use | shared pool, semaphore-capped | `kernel.db` wrapper (W1.T7) |
| 11 | k6 p95 regression per scenario | < 5% over baseline | W6.T2 (pending) |
| 12 | Hydration weight per page | 80 KB | `npm run hydration:check` (W5.T6) |
| 13 | Lighthouse delta on PDP/PLP | ± 3 points | `npm run lighthouse:check` (W5.T10 — scaffold) |

## Why these numbers

- **Hooks (100 ms / 50 ms)**: a hot order-place path can carry 3-5
  hooks; at 100 ms each that's 0.5 s added to the user's checkout
  click. We picked the budget that keeps user-perceived latency
  below the "this site is slow" threshold even when a hook misbehaves.
- **Events (30 s)**: BullMQ's default lockDuration; if a handler
  takes longer it gets re-attempted, which is fine for retryable
  side-effects but bad for non-idempotent work (which is what
  service-level idempotency references are for; see [W3.T3 cashback
  subscriber](../../backend/src/wallet/order-cashback.subscriber.ts)
  for the pattern).
- **1 Prisma query per hook**: anything more belongs in an event
  consumer. Forces the plugin author to think about caching the
  context they need.
- **50 KB / 80 KB per page**: enough room for a richly-interactive
  widget; not enough room to ship a library that overlaps with the
  host bundle.
- **5% k6 regression**: small enough to detect a real regression
  (a poorly-indexed Prisma query in a hot path); large enough to
  absorb run-to-run noise.

## Observability surfaces

Every plugin-invoked code path gets four attribution channels
automatically (W1.T14):

| Channel | What you see |
|---|---|
| **OpenTelemetry** | Every span inside plugin code gets `plugin.id` as a resource attribute. Filter Jaeger / Tempo with `plugin.id != "kernel" AND duration > 50ms` to find the culprit. |
| **Sentry** | `Sentry.withScope(scope => scope.setTag('plugin', id))` so every captured error carries the plugin tag. Per-plugin Sentry sample-rate overrides in the manifest. |
| **Prometheus** | Auto-emitted: `shopverse_plugin_hook_duration_seconds{plugin,hook}` and `shopverse_plugin_event_duration_seconds{plugin,event}` histograms. Wired into Grafana via the existing dashboard JSON. |
| **Structured logs** | Pino-style with `{ plugin: "@shopverse/plugin-foo", ... }` keys. Aggregated by Loki / Datadog like any kernel log. |

No manual instrumentation required. The SDK's
[`runInPluginContext`](../../backend/src/common/plugin-context.ts)
ALS wrapper does it.

## CircuitBreaker semantics (W1.T15)

Per plugin, per hook:

```
closed → 5 consecutive failures in 60 s → open
                                              ↓
                                       cooldown 60 s
                                              ↓
                                          half-open
                                              ↓
                            success ← next call → failure
                               ↓                     ↓
                            closed                  open
```

When open:
- Sync hooks → skipped silently, WARN log
- Async events → BullMQ retry continues (breaker doesn't gate the
  queue dispatcher; the handler may still fail but the breaker
  records it)
- Strategies → fall back to the kernel's default (if any) or 503
  to the user

Every breaker-open event creates a Sentry issue tagged with `plugin`.
A Prometheus alert fires on
`rate(shopverse_plugin_breaker_open_total[5m]) > 0`. The W6.T3
admin page surfaces all of this in one view.

## Local profiling

For a hot-path hook regression, the simplest path is:

```bash
# Capture the order-place k6 scenario:
cd bench && k6 run -e BASE_URL=http://localhost:3000 scenarios/order-place.js

# Look at the OTel trace for one slow span:
docker compose exec backend curl -s localhost:9464/metrics | grep plugin
```

Then in Jaeger, filter by `plugin.id = @shopverse/plugin-<name>` —
the slow span is right there.

## When the budget is wrong for your plugin

If your plugin legitimately needs more than the budget allows:

1. Don't disable the gate. The gate exists to protect downstream
   users who didn't ask for the regression.
2. Move expensive work into an event handler instead of a sync
   hook (events have 30 s; hooks have 100 ms).
3. Cache aggressively. The `kernel.db` semaphore is per-plugin;
   one slow query can starve every other call.
4. Open an issue with the k6 trace + budget gap; the budget can be
   raised IF the alternative is "plugins can't be built at all".

The default answer is "fix the plugin," not "raise the budget."
