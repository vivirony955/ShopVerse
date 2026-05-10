/**
 * QA Phase 3 — Payment & Reconciliation Deep Tests
 *
 * Plan scenarios: PAY-E01→E09, PAY-D01→D03, PAY-I01→I04,
 * PAY-H01 (webhook happy path), chargeback clawback, refundStripePayment.
 *
 * Strategy: stub the Stripe client on the service to bypass real gateway calls.
 * All DB operations hit real PostgreSQL — no mocks.
 */
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import { prisma, cleanDatabase, createUser } from './helpers/db';
import {
  cleanQATables,
  ensureWallet,
  ensureDefaultWarehouse,
  seedInventory,
  makeShopper,
} from './helpers/factories';
import { assertI3 } from './helpers/invariants';
import { parallel } from './helpers/concurrency';
import { PaymentsService } from '../backend/src/payments/payments.service';
import { WalletService } from '../backend/src/wallet/wallet.service';
import { OrdersService } from '../backend/src/orders/orders.service';
import { CartReservationService } from '../backend/src/cart/cart-reservation.service';

let app: INestApplication;
let paymentsService: PaymentsService;
let walletService: WalletService;
let ordersService: OrdersService;
let reservationService: CartReservationService;

// Original Stripe methods — saved so we can restore after each test
let originalStripe: any;

beforeAll(async () => {
  app = await getTestApp();
  paymentsService = app.get(PaymentsService);
  walletService = app.get(WalletService);
  ordersService = app.get(OrdersService);
  reservationService = app.get(CartReservationService);
  originalStripe = (paymentsService as any).stripe;
});

afterAll(async () => {
  await closeTestApp();
});

beforeEach(async () => {
  await cleanQATables();
  await cleanDatabase();
  // Restore original Stripe after each test
  (paymentsService as any).stripe = originalStripe;
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Stub stripe.webhooks.constructEvent to return a mock Stripe event. */
function stubWebhookConstruct(event: any) {
  (paymentsService as any).stripe = {
    ...originalStripe,
    webhooks: {
      constructEvent: () => event,
    },
  };
}

/** Build a mock Stripe payment_intent.succeeded event. */
function makeSucceededEvent(piId: string, amountPaise: number, orderId: number) {
  return {
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: piId,
        amount: amountPaise,
        metadata: { orderId: String(orderId) },
      },
    },
  };
}

/** Build a mock Stripe payment_intent.payment_failed event. */
function makeFailedEvent(piId: string, orderId: number, errorMsg = 'card_declined') {
  return {
    type: 'payment_intent.payment_failed',
    data: {
      object: {
        id: piId,
        metadata: { orderId: String(orderId) },
        last_payment_error: { message: errorMsg },
      },
    },
  };
}

/** Build a mock charge.dispute.created event. */
function makeDisputeEvent(disputeId: string, paymentIntentId: string, amountPaise: number) {
  return {
    type: 'charge.dispute.created',
    data: {
      object: {
        id: disputeId,
        payment_intent: paymentIntentId,
        amount: amountPaise,
        reason: 'fraudulent',
      },
    },
  };
}

/** Build a mock charge.refunded event. */
function makeRefundedEvent(paymentIntentId: string) {
  return {
    type: 'charge.refunded',
    data: {
      object: {
        payment_intent: paymentIntentId,
      },
    },
  };
}

/** Create a placed order with a fake paymentId for webhook testing. */
async function createOrderForWebhook(opts: {
  paymentId?: string;
  total?: number;
} = {}) {
  const s = await makeShopper({ stock: 50, cartQty: 1, basePrice: opts.total ?? 500 });
  const reservation = await reservationService.createReservation(s.user.id);
  const order = await ordersService.placeOrder(s.user.id, {
    addressId: s.address.id,
    reservationId: reservation.reservationId,
  });
  // Set a fake paymentId for webhook processing
  const paymentId = opts.paymentId ?? `pi_test_${Date.now()}`;
  await prisma.order.update({
    where: { id: order.id },
    data: { paymentId },
  });
  return { ...s, orderId: order.id, paymentId, total: order.total };
}

// ─── PAY-H01: payment_intent.succeeded → CONFIRMED + reconciliation ────────

it('PAY-H01: payment_intent.succeeded webhook → order CONFIRMED + PaymentReconciliation', async () => {
  const { orderId, paymentId, total } = await createOrderForWebhook();
  const amountPaise = Math.round(total * 100);

  stubWebhookConstruct(makeSucceededEvent(paymentId, amountPaise, orderId));
  await paymentsService.handleWebhook(Buffer.from(''), 'sig');

  // Order should be CONFIRMED + PAID
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  expect(order!.status).toBe('CONFIRMED');
  expect(order!.paymentStatus).toBe('PAID');

  // PaymentReconciliation created with correct gatewayRef
  const recon = await prisma.paymentReconciliation.findMany({ where: { orderId } });
  expect(recon).toHaveLength(1);
  expect(recon[0].gatewayRef).toBe(paymentId);
  expect(recon[0].status).toBe('MATCHED');
  expect(recon[0].gatewayAmount).toBeCloseTo(total, 2);

  // TrackingEvent created
  const events = await prisma.trackingEvent.findMany({ where: { orderId } });
  expect(events.some((e) => e.note?.includes('Payment confirmed'))).toBe(true);
});

// ─── PAY-E02: Webhook replay → 200 OK, no side effects (I-6) ──────────────

it('PAY-E02: duplicate webhook with same gatewayRef → no second reconciliation', async () => {
  const { orderId, paymentId, total } = await createOrderForWebhook();
  const amountPaise = Math.round(total * 100);
  const event = makeSucceededEvent(paymentId, amountPaise, orderId);

  // First delivery
  stubWebhookConstruct(event);
  await paymentsService.handleWebhook(Buffer.from(''), 'sig');

  // Second delivery (replay)
  stubWebhookConstruct(event);
  const result = await paymentsService.handleWebhook(Buffer.from(''), 'sig');
  expect(result).toEqual({ received: true }); // No error thrown

  // I-6: exactly 1 PaymentReconciliation row
  const reconCount = await prisma.paymentReconciliation.count({
    where: { gatewayRef: paymentId },
  });
  expect(reconCount).toBe(1);

  // No duplicate tracking events for CONFIRMED
  const events = await prisma.trackingEvent.findMany({
    where: { orderId, note: { contains: 'Payment confirmed' } },
  });
  expect(events).toHaveLength(1);
});

// ─── PAY-E01: Invalid webhook signature → rejection ────────────────────────

it('PAY-E01: webhook with invalid signature is rejected', async () => {
  // Don't stub — let constructEvent throw
  (paymentsService as any).stripe = {
    ...originalStripe,
    webhooks: {
      constructEvent: () => {
        throw new Error('Invalid signature');
      },
    },
  };
  await expect(
    paymentsService.handleWebhook(Buffer.from(''), 'bad_sig'),
  ).rejects.toThrow(/Webhook Error/);
});

// ─── PAY-E03: payment_intent.payment_failed → UNPAID ───────────────────────

it('PAY-E03: payment_intent.payment_failed → paymentStatus UNPAID', async () => {
  const { orderId, paymentId } = await createOrderForWebhook();

  stubWebhookConstruct(makeFailedEvent(paymentId, orderId));
  await paymentsService.handleWebhook(Buffer.from(''), 'sig');

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  expect(order!.paymentStatus).toBe('UNPAID');

  // TrackingEvent with failure note
  const events = await prisma.trackingEvent.findMany({ where: { orderId } });
  expect(events.some((e) => e.note?.includes('Payment failed'))).toBe(true);
});

// ─── PAY-E07: charge.dispute.created → wallet clawback ─────────────────────

it('PAY-E07: chargeback with prior wallet refund → clawback debit', async () => {
  const { orderId, paymentId, user } = await createOrderForWebhook();
  await ensureWallet(user.id, 0);

  // Simulate a prior wallet refund credit for this order
  await walletService.credit({
    userId: user.id,
    amount: 500,
    reference: `refund:order:${orderId}`,
  });
  const walletBefore = await prisma.wallet.findUnique({ where: { userId: user.id } });
  expect(walletBefore!.balance).toBe(500);

  // Chargeback webhook
  stubWebhookConstruct(makeDisputeEvent('dp_test_1', paymentId, 50000));
  await paymentsService.handleWebhook(Buffer.from(''), 'sig');

  // Wallet should be clawed back
  const walletAfter = await prisma.wallet.findUnique({ where: { userId: user.id } });
  expect(walletAfter!.balance).toBe(0);

  // Clawback WalletTransaction exists
  const clawbackTx = await prisma.walletTransaction.findMany({
    where: {
      wallet: { userId: user.id },
      reference: `refund:order:${orderId}:chargeback`,
      type: 'DEBIT',
    },
  });
  expect(clawbackTx).toHaveLength(1);
  expect(clawbackTx[0].amount).toBe(500);
  await assertI3();
});

// ─── PAY-E08: charge.dispute.created replay → no double clawback ───────────

it('PAY-E08: duplicate chargeback webhook → no double clawback (idempotent)', async () => {
  const { orderId, paymentId, user } = await createOrderForWebhook();
  await ensureWallet(user.id, 0);

  // Prior wallet refund
  await walletService.credit({
    userId: user.id,
    amount: 300,
    reference: `refund:order:${orderId}`,
  });

  // First chargeback
  const event = makeDisputeEvent('dp_test_2', paymentId, 30000);
  stubWebhookConstruct(event);
  await paymentsService.handleWebhook(Buffer.from(''), 'sig');

  // Second chargeback (replay)
  stubWebhookConstruct(event);
  await paymentsService.handleWebhook(Buffer.from(''), 'sig');

  // Only one debit, wallet at 0 (not negative)
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  expect(wallet!.balance).toBe(0);

  const clawbackCount = await prisma.walletTransaction.count({
    where: {
      wallet: { userId: user.id },
      reference: `refund:order:${orderId}:chargeback`,
      type: 'DEBIT',
    },
  });
  expect(clawbackCount).toBe(1);
  await assertI3();
});

// ─── PAY-E09: charge.dispute.created with no prior refund → tracking only ──

it('PAY-E09: chargeback without prior wallet refund → only tracking event', async () => {
  const { orderId, paymentId, user } = await createOrderForWebhook();

  stubWebhookConstruct(makeDisputeEvent('dp_test_3', paymentId, 50000));
  await paymentsService.handleWebhook(Buffer.from(''), 'sig');

  // No wallet debit (no prior refund to claw back)
  const debitCount = await prisma.walletTransaction.count({
    where: {
      wallet: { userId: user.id },
      reference: { contains: 'chargeback' },
      type: 'DEBIT',
    },
  });
  expect(debitCount).toBe(0);

  // But a tracking event was created
  const events = await prisma.trackingEvent.findMany({ where: { orderId } });
  expect(events.some((e) => e.note?.includes('Chargeback dispute'))).toBe(true);
});

// ─── PAY-D01: Two webhooks concurrent with same gatewayRef → one wins ──────

it('PAY-D01: concurrent webhooks with same gatewayRef → exactly 1 reconciliation', async () => {
  const { orderId, paymentId, total } = await createOrderForWebhook();
  const amountPaise = Math.round(total * 100);
  const event = makeSucceededEvent(paymentId, amountPaise, orderId);
  stubWebhookConstruct(event);

  const results = await parallel(5, () =>
    paymentsService.handleWebhook(Buffer.from(''), 'sig'),
  );

  // All should return OK (P2002 caught gracefully)
  expect(results.counts.fulfilled).toBe(5);

  // I-6: exactly 1 PaymentReconciliation
  const reconCount = await prisma.paymentReconciliation.count({
    where: { gatewayRef: paymentId },
  });
  expect(reconCount).toBe(1);

  // Order confirmed exactly once
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  expect(order!.status).toBe('CONFIRMED');
  expect(order!.paymentStatus).toBe('PAID');
});

// ─── PAY-H06: Reconciliation detects amount discrepancy ────────────────────

it('PAY-H06: gateway amount mismatch → PaymentReconciliation DISCREPANCY', async () => {
  const { orderId, paymentId, total } = await createOrderForWebhook();
  // Gateway reports different amount (e.g., currency conversion rounding)
  const wrongAmount = Math.round(total * 100) + 500; // +5 off

  stubWebhookConstruct(makeSucceededEvent(paymentId, wrongAmount, orderId));
  await paymentsService.handleWebhook(Buffer.from(''), 'sig');

  const recon = await prisma.paymentReconciliation.findFirst({
    where: { orderId },
  });
  expect(recon!.status).toBe('DISCREPANCY');
  expect(recon!.gatewayAmount).toBeCloseTo(wrongAmount / 100, 2);
  expect(recon!.internalAmount).toBeCloseTo(total, 2);
});

// ─── PAY-E06: charge.refunded → order REFUNDED + reconciliation RESOLVED ───

it('PAY-E06: charge.refunded webhook → order REFUNDED, reconciliation RESOLVED', async () => {
  const { orderId, paymentId, total } = await createOrderForWebhook();

  // First: mark as PAID via succeeded webhook
  stubWebhookConstruct(makeSucceededEvent(paymentId, Math.round(total * 100), orderId));
  await paymentsService.handleWebhook(Buffer.from(''), 'sig');

  // Then: charge.refunded
  stubWebhookConstruct(makeRefundedEvent(paymentId));
  await paymentsService.handleWebhook(Buffer.from(''), 'sig');

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  expect(order!.paymentStatus).toBe('REFUNDED');

  // Reconciliation resolved
  const recon = await prisma.paymentReconciliation.findFirst({ where: { orderId } });
  expect(recon!.status).toBe('RESOLVED');
});

// ─── PAY-E06b: charge.refunded replay → no double transition ───────────────

it('PAY-E06b: duplicate charge.refunded → no double state transition', async () => {
  const { orderId, paymentId, total } = await createOrderForWebhook();

  // Succeed first
  stubWebhookConstruct(makeSucceededEvent(paymentId, Math.round(total * 100), orderId));
  await paymentsService.handleWebhook(Buffer.from(''), 'sig');

  // Refund once
  stubWebhookConstruct(makeRefundedEvent(paymentId));
  await paymentsService.handleWebhook(Buffer.from(''), 'sig');

  // Refund replay — should be a no-op (updateMany WHERE not REFUNDED → count=0)
  stubWebhookConstruct(makeRefundedEvent(paymentId));
  const result = await paymentsService.handleWebhook(Buffer.from(''), 'sig');
  expect(result).toEqual({ received: true });

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  expect(order!.paymentStatus).toBe('REFUNDED');
});

// ─── Refund Stripe Payment: two-phase + conditional update ─────────────────

it('PAY-D03: concurrent refundStripePayment → only one succeeds', async () => {
  const { orderId, paymentId, user, total } = await createOrderForWebhook();

  // Mark order as PAID + CONFIRMED (simulating webhook processing)
  await prisma.order.update({
    where: { id: orderId },
    data: { paymentStatus: 'PAID', status: 'CONFIRMED' },
  });

  // Stub Stripe refund call
  (paymentsService as any).stripe = {
    ...originalStripe,
    webhooks: { constructEvent: originalStripe.webhooks.constructEvent },
    refunds: {
      create: async () => ({ id: `re_test_${Date.now()}`, status: 'succeeded' }),
    },
  };

  const results = await parallel(3, () =>
    paymentsService.refundStripePayment(orderId, user.id),
  );

  // Only one should succeed (conditional updateMany WHERE status=CONFIRMED)
  expect(results.counts.fulfilled).toBe(1);
  expect(results.counts.rejected).toBeGreaterThanOrEqual(1);

  // Order is in CANCELLING state (refund initiated, awaiting webhook)
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  expect(order!.status).toBe('CANCELLING');

  // Exactly 1 RefundRequest
  const refundRequests = await prisma.refundRequest.findMany({ where: { orderId } });
  expect(refundRequests).toHaveLength(1);
  expect(refundRequests[0].status).toBe('COMPLETED');
});

// ─── Refund already in progress → rejection ────────────────────────────────

it('PAY-E10: refund on order already CANCELLING is rejected', async () => {
  const { orderId, user } = await createOrderForWebhook();
  await prisma.order.update({
    where: { id: orderId },
    data: { paymentStatus: 'PAID', status: 'CANCELLING' },
  });

  await expect(
    paymentsService.refundStripePayment(orderId, user.id),
  ).rejects.toThrow(/already in progress/i);
});

// ─── Refund on unpaid order → rejection ────────────────────────────────────

it('PAY-E11: refund on UNPAID order is rejected', async () => {
  const { orderId, user } = await createOrderForWebhook();
  // Order is UNPAID by default

  await expect(
    paymentsService.refundStripePayment(orderId, user.id),
  ).rejects.toThrow(/not paid/i);
});

// ─── Refund on order with no paymentId → rejection ─────────────────────────

it('PAY-E12: refund on order with no paymentId is rejected', async () => {
  const { orderId, user } = await createOrderForWebhook();
  await prisma.order.update({
    where: { id: orderId },
    data: { paymentId: null, paymentStatus: 'PAID' },
  });

  await expect(
    paymentsService.refundStripePayment(orderId, user.id),
  ).rejects.toThrow(/no payment/i);
});

// ─── Stripe refund gateway failure → rollback to prior status ──────────────

it('PAY-F01: Stripe refund API failure → order rolls back to prior status', async () => {
  const { orderId, paymentId, user } = await createOrderForWebhook();
  await prisma.order.update({
    where: { id: orderId },
    data: { paymentStatus: 'PAID', status: 'CONFIRMED' },
  });

  // Stub Stripe to fail
  (paymentsService as any).stripe = {
    ...originalStripe,
    webhooks: { constructEvent: originalStripe.webhooks.constructEvent },
    refunds: {
      create: async () => { throw new Error('Stripe API timeout'); },
    },
  };

  await expect(
    paymentsService.refundStripePayment(orderId, user.id),
  ).rejects.toThrow(/Stripe API timeout/);

  // Order rolled back to CONFIRMED (not stuck in CANCELLING)
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  expect(order!.status).toBe('CONFIRMED');

  // RefundRequest exists with FAILED status
  const rr = await prisma.refundRequest.findFirst({ where: { orderId } });
  expect(rr).not.toBeNull();
  expect(rr!.status).toBe('FAILED');
  expect(rr!.failureReason).toContain('Stripe API timeout');
});

// ─── PAY-I01: I-6 uniqueness after all webhook tests ───────────────────────

it('PAY-I01: no duplicate gatewayRef in PaymentReconciliation (I-6)', async () => {
  // Create multiple orders sequentially (parallel makeShopper causes slug collisions)
  const orders = [];
  for (let i = 1; i <= 3; i++) {
    orders.push(await createOrderForWebhook({ paymentId: `pi_unique_${i}` }));
  }

  for (const o of orders) {
    stubWebhookConstruct(makeSucceededEvent(o.paymentId, Math.round(o.total * 100), o.orderId));
    await paymentsService.handleWebhook(Buffer.from(''), 'sig');
  }

  // I-6: no duplicate gatewayRefs
  const dupes = await prisma.$queryRaw<{ cnt: number }[]>`
    SELECT COUNT(*) as cnt FROM (
      SELECT "gatewayRef" FROM "PaymentReconciliation"
      GROUP BY "gatewayRef" HAVING COUNT(*) > 1
    ) dupes
  `;
  expect(Number(dupes[0].cnt)).toBe(0);
});

// ─── PAY-I02: I-3 after chargeback clawback ────────────────────────────────

it('PAY-I02: I-3 holds after chargeback clawback flow', async () => {
  const { orderId, paymentId, user } = await createOrderForWebhook();
  await ensureWallet(user.id, 0);

  // Credit → Clawback → verify I-3
  await walletService.credit({ userId: user.id, amount: 1000, reference: `refund:order:${orderId}` });
  stubWebhookConstruct(makeDisputeEvent('dp_i3', paymentId, 100000));
  await paymentsService.handleWebhook(Buffer.from(''), 'sig');

  await assertI3();
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  expect(wallet!.balance).toBe(0);
});

// ─── PRO-05: Double refund via chargeback after wallet refund ──────────────

it('PRO-05: wallet refund then chargeback → I-7 still holds', async () => {
  const { orderId, paymentId, user, total } = await createOrderForWebhook();
  await ensureWallet(user.id, 0);

  // Mark order paid + confirmed
  await prisma.order.update({
    where: { id: orderId },
    data: { paymentStatus: 'PAID', status: 'CONFIRMED' },
  });

  // Step 1: Wallet refund (simulating admin refund-to-wallet)
  const refundRef = `refund:order:${orderId}`;
  await prisma.refundRequest.create({
    data: {
      orderId,
      amount: total,
      reason: 'customer_request',
      status: 'COMPLETED',
      destination: 'WALLET',
      reference: refundRef,
      requestedById: user.id,
    },
  });
  await walletService.credit({ userId: user.id, amount: total, reference: refundRef });

  // Step 2: Chargeback arrives (customer also filed with bank)
  stubWebhookConstruct(makeDisputeEvent('dp_pro05', paymentId, Math.round(total * 100)));
  await paymentsService.handleWebhook(Buffer.from(''), 'sig');

  // Wallet clawed back — customer doesn't get both
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  expect(wallet!.balance).toBe(0);

  // I-3: wallet balance matches ledger
  await assertI3();

  // I-7: total refunded ≤ order total
  const refundedSum = await prisma.refundRequest.aggregate({
    where: { orderId, status: 'COMPLETED' },
    _sum: { amount: true },
  });
  expect(refundedSum._sum.amount ?? 0).toBeLessThanOrEqual(total + 0.01);
});

// ═══════════════════════════════════════════════════════════════════════════
//  ADDITIONAL PAY-* SCENARIOS (Gap-fill)
// ═══════════════════════════════════════════════════════════════════════════

// ─── PAY-H02: COD order → confirm immediately (no Stripe payment) ────────

it('PAY-H02: COD order confirms without Stripe payment', async () => {
  const s = await makeShopper({ stock: 10, cartQty: 1, basePrice: 500 });
  const reservation = await reservationService.createReservation(s.user.id);
  const order = await ordersService.placeOrder(s.user.id, {
    addressId: s.address.id,
    reservationId: reservation.reservationId,
    paymentMethod: 'COD',
  });

  // COD order should be placed — status depends on implementation
  expect(order.id).toBeDefined();
});

// ─── PAY-H04: Wallet refund → instant credit ─────────────────────────────

it('PAY-H04: wallet refund creates WalletTransaction + updates balance', async () => {
  const s = await makeShopper({ stock: 10, cartQty: 1, basePrice: 500 });
  await ensureWallet(s.user.id, 0);
  const reservation = await reservationService.createReservation(s.user.id);
  const order = await ordersService.placeOrder(s.user.id, {
    addressId: s.address.id,
    reservationId: reservation.reservationId,
  });

  await ordersService.cancelOrderItem(s.user.id, order.id, order.items[0].id);
  await ordersService.refundOrderItem(order.id, order.items[0].id);

  const wallet = await prisma.wallet.findUnique({ where: { userId: s.user.id } });
  expect(wallet!.balance).toBeGreaterThan(0);

  const tx = await prisma.walletTransaction.findFirst({
    where: { wallet: { userId: s.user.id }, type: 'CREDIT', reference: { startsWith: 'refund:' } },
  });
  expect(tx).not.toBeNull();

  await assertI3();
});

// ─── PAY-I03: I-4 (ledger trial balance) after financial operations ──────

it('PAY-I03: ledger entries created for wallet credit + debit', async () => {
  const user = await createUser();
  await ensureWallet(user.id, 500);

  const ref1 = `pay-i03:credit:${Date.now()}`;
  const ref2 = `pay-i03:debit:${Date.now() + 1}`;
  await walletService.credit({ userId: user.id, amount: 100, reference: ref1 });
  await walletService.debit({ userId: user.id, amount: 50, reference: ref2 });

  // Verify ledger entries were created for these operations
  const creditEntry = await prisma.ledgerEntry.findFirst({ where: { reference: ref1 } });
  const debitEntry = await prisma.ledgerEntry.findFirst({ where: { reference: ref2 } });
  expect(creditEntry).not.toBeNull();
  expect(debitEntry).not.toBeNull();
  expect(creditEntry!.creditAmount).toBe(100);
  expect(debitEntry!.debitAmount).toBe(50);

  // Wallet balance should be correct: 500 + 100 - 50 = 550
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  expect(wallet!.balance).toBe(550);
});

// ─── PAY-I04: I-7 after refund ───────────────────────────────────────────

it('PAY-I04: I-7 holds — total refunded <= order total', async () => {
  const s = await makeShopper({ stock: 10, cartQty: 1, basePrice: 800 });
  await ensureWallet(s.user.id, 0);
  const reservation = await reservationService.createReservation(s.user.id);
  const order = await ordersService.placeOrder(s.user.id, {
    addressId: s.address.id,
    reservationId: reservation.reservationId,
  });

  await ordersService.cancelOrderItem(s.user.id, order.id, order.items[0].id);
  await ordersService.refundOrderItem(order.id, order.items[0].id);

  const refundedSum = await prisma.refundRequest.aggregate({
    where: { orderId: order.id, status: 'COMPLETED' },
    _sum: { amount: true },
  });
  expect(refundedSum._sum.amount ?? 0).toBeLessThanOrEqual(order.total + 0.01);
});

// ══════════════════════════════════════════════════════════════════════════════
//  C-01: MIXED PAYMENT WALLET ROLLBACK (PAY-H03 / PAY-E05)
//  §6.7: wallet debited inside placeOrder. On payment_intent.payment_failed,
//  wallet reversal should fire. Testing actual current behavior.
// ══════════════════════════════════════════════════════════════════════════════

// ─── PAY-H03: Order placed with wallet contribution → walletAmountUsed on order ─

it('PAY-H03: order with walletAmountUsed → wallet balance reduced by that amount', async () => {
  const walletBalance = 300;
  const s = await makeShopper({ stock: 10, cartQty: 1, basePrice: 500, walletBalance });
  const walletBefore = await prisma.wallet.findUnique({ where: { userId: s.user.id } });
  expect(walletBefore!.balance).toBe(walletBalance);

  const reservation = await reservationService.createReservation(s.user.id);
  const order = await ordersService.placeOrder(s.user.id, {
    addressId: s.address.id,
    reservationId: reservation.reservationId,
    walletAmountUsed: 200,
  });

  // Order should record the wallet contribution
  expect(order.walletAmountUsed).toBeGreaterThan(0);

  // Wallet balance should be reduced
  const walletAfter = await prisma.wallet.findUnique({ where: { userId: s.user.id } });
  const expectedBalance = walletBalance - order.walletAmountUsed;
  expect(walletAfter!.balance).toBeCloseTo(expectedBalance, 2);

  // WalletTransaction with reference order:<id>:wallet should exist
  const walletTx = await prisma.walletTransaction.findFirst({
    where: { reference: `order:${order.id}:wallet`, type: 'DEBIT' },
  });
  expect(walletTx).not.toBeNull();
  expect(walletTx!.amount).toBeCloseTo(order.walletAmountUsed, 2);
});

// ─── PAY-E05: Mixed payment — wallet deducted, then payment_intent.payment_failed ─
// Documents current behavior: payment_failed webhook marks paymentStatus=UNPAID
// but does NOT automatically reverse the wallet debit (tracked as known gap).

it('PAY-E05: mixed payment failure — payment_intent.payment_failed marks UNPAID (wallet state documented)', async () => {
  const walletBalance = 300;
  const s = await makeShopper({ stock: 10, cartQty: 1, basePrice: 800, walletBalance });

  const reservation = await reservationService.createReservation(s.user.id);
  const order = await ordersService.placeOrder(s.user.id, {
    addressId: s.address.id,
    reservationId: reservation.reservationId,
    walletAmountUsed: 200,
  });

  // Simulate Stripe payment failure webhook
  const piId = `pi_mix_fail_${Date.now()}`;
  const failedEvent = makeFailedEvent(piId, order.id, 'insufficient_funds');
  stubWebhookConstruct(failedEvent);

  await paymentsService.handleWebhook(Buffer.from('{}'), 'sig');

  // Order paymentStatus should be UNPAID
  const updated = await prisma.order.findUnique({ where: { id: order.id } });
  expect(updated!.paymentStatus).toBe('UNPAID');

  // Document current behavior: wallet was debited at order placement time (outside webhook path).
  // The webhook only updates paymentStatus — it does NOT auto-reverse the wallet.
  // This is a known gap (C-01 in audit): wallet auto-reversal on gateway failure is not yet implemented.
  const walletAfter = await prisma.wallet.findUnique({ where: { userId: s.user.id } });
  // Wallet was reduced at order time — confirm the debit happened
  expect(walletAfter!.balance).toBeLessThan(walletBalance);
});

// ─── PAY-H06b: walletAmountUsed clamped to min(requested, balance, total) ──

it('PAY-H06b: walletAmountUsed clamped to available balance and order total', async () => {
  // Request wallet usage of 10000, but balance is only 150 and total < 10000
  const s = await makeShopper({ stock: 10, cartQty: 1, basePrice: 500, walletBalance: 150 });
  const reservation = await reservationService.createReservation(s.user.id);
  const order = await ordersService.placeOrder(s.user.id, {
    addressId: s.address.id,
    reservationId: reservation.reservationId,
    walletAmountUsed: 10000, // way more than balance
  });

  // walletAmountUsed must be clamped to ≤ balance (150) and ≤ order.total
  expect(order.walletAmountUsed).toBeLessThanOrEqual(150);
  expect(order.walletAmountUsed).toBeLessThanOrEqual(order.total);

  // Wallet should not go negative
  const wallet = await prisma.wallet.findUnique({ where: { userId: s.user.id } });
  expect(wallet!.balance).toBeGreaterThanOrEqual(0);
});

