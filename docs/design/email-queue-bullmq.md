# Design Draft — Async Email via BullMQ (P-06)

**Status**: DRAFT — not implemented. Targets Phase 2.
**Owner**: backend
**Problem (P-06)**: `EmailService.send*` is called inline from synchronous request paths (`orders.service`, `payments.service`, `abandoned-cart.service`, `referral.service`, `admin.service`, `auth`). A slow SMTP provider or transient 5xx adds latency or throws inside business transactions, making user-visible flows brittle. No retry, no durability, no rate-limit control.

**Goal**: decouple email send from the request path. Every caller enqueues a job and returns immediately; a worker drains the queue with exponential backoff, DLQ, rate-limit, and idempotency.

---

## 1. Non-goals

- Rewriting `EmailService` templates — they stay as-is.
- Changing provider (still SendGrid / configured transport).
- Cross-region delivery or multi-tenant fanout.
- SMS / push (separate queue if/when needed).

## 2. Topology

```
caller.service  ──enqueue──▶  BullMQ(queue: "email")  ──▶  EmailWorker  ──▶  EmailService.sendRaw
                                      │                         │
                                      │                         ├─ success → remove job
                                      │                         ├─ retryable error → backoff
                                      │                         └─ max attempts → move to DLQ
                                      │
                                      └─ Redis (same instance as RedisService, separate db)
```

**Key decisions**:

| Decision | Choice | Why |
|---|---|---|
| Transport | BullMQ on existing Redis | Already have Redis (W4 / W7-1). Zero new infra. Native NestJS integration via `@nestjs/bullmq`. |
| Worker placement | Same NestJS process, separate module | Simpler ops. Can split to own deployment later with zero code change (module import toggle). |
| Serialization | JSON | BullMQ default. Keep payloads < 10KB — pass IDs, not rendered HTML. |
| Idempotency | `jobId = ${template}:${entityType}:${entityId}:${bucket}` | BullMQ skips duplicate jobId additions. Caller never worries about double-enqueue on retry. |
| Rate limit | `limiter: { max: 50, duration: 1000 }` per queue | Matches SendGrid tier ceiling. Prevents provider throttling from cascading. |
| Retries | `attempts: 5`, backoff `exponential` base 5s (5s, 10s, 20s, 40s, 80s) | ~2.5 min max delay. Covers transient 5xx / DNS blips. |
| DLQ | Failed jobs → separate `email:dead` queue | Ops can inspect, replay, or discard. BullMQ `failed` jobs by default stay on the source queue — move explicitly to avoid poisoning. |
| Observability | BullMQ events → `[EMAIL_QUEUE]` structured logs + heartbeat via admin endpoint | Reuses the O-07 pattern from `InvariantValidatorService`. |

## 3. Job shape

```ts
// backend/src/email/email-queue.types.ts (to create)
export type EmailJobName =
  | 'order-confirmation'
  | 'order-shipped'
  | 'order-delivered'
  | 'order-cancelled'
  | 'payment-receipt'
  | 'refund-initiated'
  | 'refund-completed'
  | 'abandoned-cart'
  | 'referral-reward'
  | 'password-reset'
  | 'email-verification'
  | 'welcome'
  | 'stock-back';

export interface EmailJobData {
  template: EmailJobName;
  to: string;
  // References — worker hydrates from DB. Never pass rendered HTML or PII blobs.
  entityRef?: { type: 'order' | 'refund' | 'cart' | 'user' | 'variant'; id: number };
  // Only free-form params (e.g. referral code, reset token) go here.
  vars?: Record<string, string | number>;
  // For analytics / DLQ triage
  enqueuedAt: string; // ISO
  enqueuedBy: string; // caller service name
}
```

Job ID rule: `${template}:${entityType}:${entityId}:${dayBucket}`. `dayBucket = YYYY-MM-DD` prevents the same template going out twice for the same entity on the same day (covers most idempotency needs). For templates that MUST allow multiple sends per day (e.g., password-reset), append `${Date.now()}`.

## 4. Module layout

```
backend/src/email/
  email.module.ts        # existing — exports EmailService (SMTP transport)
  email.service.ts       # existing — keep sendRaw(to, subject, html) as-is
  email-queue.module.ts  # NEW — registers BullMQ queue "email" + "email:dead"
  email-queue.service.ts # NEW — thin enqueue API: EmailQueueService.enqueue(job)
  email.worker.ts        # NEW — @Processor('email'), calls EmailService.sendRaw
  email-queue.types.ts   # NEW — types above
```

**Caller migration**: replace `this.emailService.sendOrderConfirmation(...)` with `this.emailQueue.enqueue({ template: 'order-confirmation', to, entityRef: { type: 'order', id } })`. No other change. EmailService stays injected only in the worker.

## 5. Worker logic

```ts
@Processor('email')
class EmailWorker extends WorkerHost {
  async process(job: Job<EmailJobData>) {
    const { template, to, entityRef, vars } = job.data;
    // 1. Hydrate entity from DB using entityRef (fresh read — avoids stale data
    //    if job sits in queue during backoff).
    const ctx = entityRef ? await this.hydrate(entityRef) : {};
    // 2. Render + send via existing EmailService method.
    await this.dispatch(template, to, ctx, vars);
  }
  // dispatch switch/case maps template → existing EmailService.send* method.
}
```

**Error classification**:
- Throw `UnrecoverableError` (BullMQ builtin) for 4xx from provider → no retry, straight to DLQ.
- Throw plain Error for 5xx / network / timeout → BullMQ retries with backoff.
- Business-level "entity not found" (order deleted between enqueue and process) → log WARN, `UnrecoverableError` — do not retry.

## 6. Transaction safety (critical)

**Rule**: enqueue AFTER the DB transaction commits, never inside it.

- If enqueue fails before commit → we rolled back, no email needed. ✅
- If enqueue fails after commit → log, emit `[EMAIL_QUEUE] enqueue-failed` alert. Email is lost (acceptable — driven by business outcome: re-trigger via admin tool if critical).
- If enqueue succeeds but tx commits later and rolls back → worker processes a job for a phantom entity → hydration returns null → `UnrecoverableError` → DLQ (not sent). ✅

This matches the existing `orders.service.ts::placeOrder` W6-3 pattern (side-effects after tx). Callers already use `.catch(() => {})` — the new enqueue is a drop-in replacement for those post-tx awaits.

## 7. Observability

| Metric | Source | Alert threshold |
|---|---|---|
| Queue depth | `queue.getJobCounts()` exposed via admin/health | > 1000 waiting for > 5 min |
| DLQ count | `email:dead` waiting count | > 0 → page ops |
| Worker processed rate | BullMQ `completed` event | < 10/min during business hours |
| Send latency p95 | Per-job `processedOn - timestamp` | > 2 min |
| Error rate | `failed` events / `completed` events | > 5% over 10 min |

Heartbeat: reuse the `getHeartbeats()` pattern from `InvariantValidatorService`. Expose both through a future `/admin/ops/health` endpoint.

## 8. Rollout plan

1. **Phase 2.0**: Add `@nestjs/bullmq bullmq` deps. Create queue + worker modules. Worker is a no-op stub that logs and returns.
2. **Phase 2.1**: Migrate lowest-risk callers first (`abandoned-cart`, `referral`) — non-transactional, easy rollback.
3. **Phase 2.2**: Migrate order lifecycle emails (confirmation, shipped, delivered) — validate idempotency under retries.
4. **Phase 2.3**: Migrate payment / refund emails — these touch money, require extra scrutiny on hydration correctness.
5. **Phase 2.4**: Migrate auth emails (password-reset, verification) — one-off idempotency rules (see §3).
6. **Phase 2.5**: Remove inline `sendRaw` calls from non-worker code. Enforce via ESLint rule (no-restricted-imports on EmailService outside email.worker.ts).

**Rollback**: each phase is a single PR. Rollback = revert commit. Queue stays up; callers go back to inline sends.

## 9. Open questions

- [ ] Do we need a provider abstraction (SendGrid → SES fallback)? — deferred; single provider is fine at current scale.
- [ ] Do we need per-user throttling (max 5 emails/day to same recipient)? — defer until we see abuse.
- [ ] Where does the DLQ replay UI live? — admin module, Phase 2.3+.
- [ ] Email preferences / unsubscribe check — done in worker or in EmailService? — keep in EmailService, worker stays template-agnostic.

## 10. Not doing (explicit)

- Not adding Kafka / RabbitMQ. BullMQ on existing Redis is sufficient for our throughput (< 100 emails/min).
- Not building a cron scheduler for delayed emails. BullMQ's `delay` option handles it natively.
- Not implementing "email preferences" ACL in this task — that's a separate legal/compliance story.

## 11. References

- Existing: `backend/src/email/email.service.ts` (transport, templates)
- Pattern inspiration: `backend/src/common/redis.service.ts` (isEnabled no-op fallback), `backend/src/common/invariant-validator.service.ts` (heartbeat + structured alert logs)
- Callers to migrate: `orders.service.ts`, `payments.service.ts`, `admin.service.ts`, `abandoned-cart.service.ts`, `referral.service.ts`
- PERF_FIX_PLAN.md P-06
