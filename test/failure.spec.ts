// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * QA Phase-4 — C-series failure injection tests.
 *
 * Scope: the subset of failure scenarios that are deterministically
 * reproducible inside the Jest harness without rewiring the Stripe SDK or
 * introducing kernel-level chaos (toxiproxy, pg_terminate_backend). The
 * remaining scenarios land in Phase-7 load/chaos scripts where their
 * cost/value trade-off is better.
 *
 * Scenarios covered here:
 *
 *   QA-C-02 — Stripe webhook replay / I-6 dedupe.
 *             Validates the authoritative invariant that makes the
 *             `PaymentsService.handleWebhook` idempotency-by-DB-constraint
 *             pattern safe: two concurrent inserts on the same
 *             `PaymentReconciliation.gatewayRef` must produce exactly one
 *             row via a P2002 on the winner's side. This is the same SQL
 *             path payments.service.ts:126 takes — if the unique index is
 *             ever dropped, this test fails loudly.
 *
 *   QA-C-05 — Refund retry exhaustion → WARN alert.
 *             Seeds a `RefundRequest` in PROCESSING with retryCount=5
 *             and exercises `RefundRetryService.markAndAlertPermanentFailures`
 *             (private, accessed via bracket notation on the DI-resolved
 *             service instance). Verifies:
 *               (a) the row is flipped to FAILED,
 *               (b) a TrackingEvent is recorded with the alert note,
 *               (c) a second invocation is a no-op (idempotent — the
 *                   conditional `updateMany(status='PROCESSING')` skips it).
 *
 *   QA-C-09 — Stale invariant heartbeat (A-2 regression guard).
 *             Verifies the `?? 0` fix in `InvariantValidatorService.runValidator`
 *             by exercising all three branches:
 *               1. body returns undefined → heartbeat NOT set (lock held by
 *                  other pod, intentional early-return).
 *               2. body returns 0 → heartbeat set with lastStatus=OK.
 *               3. body returns N>0 → heartbeat set with lastStatus=VIOLATIONS.
 *             If A-2 regresses and `?? 0` is re-introduced, branch (1)
 *             would incorrectly set heartbeat to OK and this test fails.
 */
import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getTestApp, closeTestApp } from './helpers/app';
import { cleanDatabase, prisma } from './helpers/db';
import { cleanQATables, makeShopper } from './helpers/factories';
import { RefundRetryService } from '../backend/src/payments/refund-retry.service';
import { InvariantValidatorService } from '../backend/src/common/invariant-validator.service';

describe('QA Phase-4: C-series failure injection', () => {
  let app: INestApplication;
  let refundRetry: RefundRetryService;
  let invariants: InvariantValidatorService;

  beforeAll(async () => {
    app = await getTestApp();
    refundRetry = app.get(RefundRetryService);
    invariants = app.get(InvariantValidatorService);
  });

  beforeEach(async () => {
    await cleanQATables();
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanQATables();
    await cleanDatabase();
    await closeTestApp();
    await prisma.$disconnect();
  });

  // ─── QA-C-02: webhook replay idempotency (I-6) ───────────────────────────

  it('QA-C-02: duplicate Stripe webhook → exactly 1 PaymentReconciliation row (I-6)', async () => {
    // Setup a real order so the FK to PaymentReconciliation.orderId is valid.
    const s = await makeShopper({ stock: 1 });
    const order = await prisma.order.create({
      data: {
        userId: s.user.id,
        addressSnapshot: { line1: 'test' } as any,
        subtotal: 1000,
        total: 1000,
        status: 'PENDING',
        paymentStatus: 'UNPAID',
      },
    });

    const gatewayRef = `pi_fake_${order.id}_${Date.now()}`;

    // First "webhook delivery" — full transaction succeeds, mirrors payments.service.ts:124-148.
    await prisma.$transaction(async (tx) => {
      await tx.paymentReconciliation.create({
        data: {
          orderId: order.id,
          gatewayRef,
          gatewayAmount: 1000,
          internalAmount: 1000,
          status: 'MATCHED',
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'PAID', status: 'CONFIRMED' },
      });
    });

    // Second "webhook delivery" — same gatewayRef. Must P2002.
    let duplicateRejected = false;
    try {
      await prisma.paymentReconciliation.create({
        data: {
          orderId: order.id,
          gatewayRef,
          gatewayAmount: 1000,
          internalAmount: 1000,
          status: 'MATCHED',
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        duplicateRejected = true;
      } else {
        throw e;
      }
    }
    expect(duplicateRejected).toBe(true);

    // Authoritative DB state: exactly one row for this gatewayRef.
    const rows = await prisma.paymentReconciliation.findMany({ where: { gatewayRef } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('MATCHED');

    // Order state remained CONFIRMED/PAID (no regression to UNPAID).
    const o = await prisma.order.findUnique({ where: { id: order.id } });
    expect(o?.paymentStatus).toBe('PAID');
    expect(o?.status).toBe('CONFIRMED');
  });

  // ─── QA-C-05: refund retry exhaustion WARN alert ─────────────────────────

  it('QA-C-05: RefundRequest at retryCount=5 → markAndAlertPermanentFailures flips to FAILED + TrackingEvent', async () => {
    const s = await makeShopper({ stock: 1 });
    const order = await prisma.order.create({
      data: {
        userId: s.user.id,
        addressSnapshot: { line1: 'test' } as any,
        subtotal: 500,
        total: 500,
        status: 'CANCELLING',
        paymentStatus: 'PAID',
        paymentId: `pi_exhausted_${Date.now()}`,
      },
    });

    const ref = `refund:order:${order.id}:exhausted`;
    const rr = await prisma.refundRequest.create({
      data: {
        orderId: order.id,
        amount: 500,
        reason: 'customer_request',
        status: 'PROCESSING',
        destination: 'ORIGINAL_PAYMENT',
        reference: ref,
        retryCount: 5, // already at MAX_REFUND_RETRIES
        failureReason: 'simulated gateway timeout',
      },
    });

    // Call the private method directly via bracket access — the public
    // retryStuckRefunds wraps it in cronLock + Stripe retries which would
    // need a mock. This isolates the alert branch.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (refundRetry as any).markAndAlertPermanentFailures();

    const after = await prisma.refundRequest.findUnique({ where: { id: rr.id } });
    expect(after?.status).toBe('FAILED');
    expect(after?.retryCount).toBe(5);

    const events = await prisma.trackingEvent.findMany({
      where: { orderId: order.id },
      orderBy: { id: 'asc' },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    const alertEvt = events.find((e) => /permanently failed/i.test(e.note ?? ''));
    expect(alertEvt).toBeDefined();

    // Idempotency: second invocation must be a no-op (the conditional
    // updateMany(status='PROCESSING') guard is the mechanism). If it isn't,
    // we'd get a second TrackingEvent.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (refundRetry as any).markAndAlertPermanentFailures();
    const eventsAfterReplay = await prisma.trackingEvent.findMany({
      where: { orderId: order.id, note: { contains: 'permanently failed' } },
    });
    expect(eventsAfterReplay).toHaveLength(1);
  });

  // ─── QA-C-09: stale invariant heartbeat / A-2 regression guard ───────────

  it('QA-C-09: runValidator body returns undefined → heartbeat NOT updated (A-2 regression)', async () => {
    // runValidator is private; bracket-access is intentional — this is the
    // exact surface the A-2 fix protects, and the public cron wrappers add
    // their own cronLock which would mask the test.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = invariants as any;

    // Clear any residual heartbeats from other tests.
    svc.heartbeats.clear();

    // Branch 1: body returns undefined (lock held by other pod).
    await svc.runValidator('qa-c-09-skipped', async () => undefined);
    expect(svc.heartbeats.get('qa-c-09-skipped')).toBeUndefined();

    // Branch 2: body returns 0 (OK).
    await svc.runValidator('qa-c-09-ok', async () => 0);
    const okHb = svc.heartbeats.get('qa-c-09-ok');
    expect(okHb).toBeDefined();
    expect(okHb.lastStatus).toBe('OK');
    expect(okHb.violationCount).toBe(0);

    // Branch 3: body returns N>0 (VIOLATIONS).
    await svc.runValidator('qa-c-09-violations', async () => 3);
    const vHb = svc.heartbeats.get('qa-c-09-violations');
    expect(vHb).toBeDefined();
    expect(vHb.lastStatus).toBe('VIOLATIONS');
    expect(vHb.violationCount).toBe(3);

    // Branch 4: body throws (ERROR, covered for completeness).
    await svc.runValidator('qa-c-09-error', async () => {
      throw new Error('simulated DB failure');
    });
    const eHb = svc.heartbeats.get('qa-c-09-error');
    expect(eHb).toBeDefined();
    expect(eHb.lastStatus).toBe('ERROR');
    expect(eHb.violationCount).toBe(-1);
  });
});
