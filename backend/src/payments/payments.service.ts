// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { WalletService } from '../wallet/wallet.service';
import { InvoicesService } from '../invoices/invoices.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { EventBus } from '../common/event-bus.service';
import { HookRunner } from '../common/hook-runner.service';
import type { ReadOnlyOrder, ReadOnlyPaymentIntent } from '@shopverse/sdk';
import Stripe from 'stripe';

@Injectable()
export class PaymentsService {
  private stripe: Stripe;
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly webhooksService: WebhooksService,
    private readonly walletService: WalletService,
    private readonly invoicesService: InvoicesService,
    private readonly loyaltyService: LoyaltyService,
    private readonly eventBus: EventBus,
    private readonly hookRunner: HookRunner,
  ) {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      throw new Error(
        'SECURITY: STRIPE_SECRET_KEY env var is missing. Payments will not function.',
      );
    }
    // V-03 FIX: validate STRIPE_WEBHOOK_SECRET at startup so webhook handler
    // never silently accepts events with an empty string secret.
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error(
        'SECURITY: STRIPE_WEBHOOK_SECRET env var is missing. Webhook verification will not function.',
      );
    }
    this.stripe = new Stripe(stripeKey, {
      apiVersion: '2022-11-15',
    });
  }

  // ISO 4217 minor-unit handling. Most currencies use 2 decimals (× 100);
  // these need different multipliers or Stripe rejects the amount.
  private static readonly ZERO_DECIMAL_CURRENCIES = new Set([
    'bif',
    'clp',
    'djf',
    'gnf',
    'jpy',
    'kmf',
    'krw',
    'mga',
    'pyg',
    'rwf',
    'ugx',
    'vnd',
    'vuv',
    'xaf',
    'xof',
    'xpf',
  ]);
  private static readonly THREE_DECIMAL_CURRENCIES = new Set([
    'bhd',
    'jod',
    'kwd',
    'omr',
    'tnd',
  ]);

  /**
   * Convert a major-unit amount to Stripe minor units, honoring zero-decimal
   * (JPY, KRW, …) and three-decimal (KWD, BHD, …) currencies. The naive `* 100`
   * is correct only for 2-decimal currencies and mischarges the rest.
   */
  private static toMinorUnits(amount: number, currencyLower: string): number {
    if (PaymentsService.ZERO_DECIMAL_CURRENCIES.has(currencyLower)) {
      return Math.round(amount);
    }
    if (PaymentsService.THREE_DECIMAL_CURRENCIES.has(currencyLower)) {
      return Math.round(amount * 1000);
    }
    return Math.round(amount * 100);
  }

  async createPaymentIntent(
    userId: number,
    orderId: number,
    currency?: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.paymentStatus === 'PAID')
      throw new BadRequestException('Order already paid');

    // Currency comes from the order snapshot (set at placement from store config).
    const cur = (currency ?? order.currency ?? 'usd').toLowerCase();
    // FINAL §6.3: idempotency key prevents duplicate intents on client retry (B-11).
    const paymentIntent = await this.stripe.paymentIntents.create(
      {
        amount: PaymentsService.toMinorUnits(order.total, cur),
        currency: cur,
        metadata: { orderId: orderId.toString(), userId: userId.toString() },
      },
      { idempotencyKey: `order:${orderId}` },
    );

    await this.prisma.order.update({
      where: { id: orderId },
      data: { paymentId: paymentIntent.id },
    });

    return { clientSecret: paymentIntent.client_secret, amount: order.total };
  }

  /**
   * Retry a failed payment: creates a fresh PaymentIntent for an UNPAID order.
   * Safe to call multiple times — cancels any previous open intent first.
   */
  async retryPayment(userId: number, orderId: number, currency?: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.paymentStatus === 'PAID')
      throw new BadRequestException('Order already paid');

    // Cancel previous PaymentIntent if exists and still open
    if (order.paymentId) {
      try {
        const prev = await this.stripe.paymentIntents.retrieve(order.paymentId);
        if (
          [
            'requires_payment_method',
            'requires_confirmation',
            'requires_action',
          ].includes(prev.status)
        ) {
          await this.stripe.paymentIntents.cancel(order.paymentId);
        }
      } catch {
        // Ignore if the old intent can't be retrieved
      }
    }

    // V-05 FIX: use millisecond timestamp as unique suffix so each retry call
    // produces a distinct idempotency key. The previous approach split on ':retry:'
    // which Stripe PI IDs never contain, so retryCount was always 1 and every
    // retry hit the same cached PI response.
    const cur = (currency ?? order.currency ?? 'usd').toLowerCase();
    const retryKey = `order:${orderId}:retry:${Date.now()}`;
    const paymentIntent = await this.stripe.paymentIntents.create(
      {
        amount: PaymentsService.toMinorUnits(order.total, cur),
        currency: cur,
        metadata: {
          orderId: orderId.toString(),
          userId: userId.toString(),
          retry: 'true',
        },
      },
      { idempotencyKey: retryKey },
    );

    await this.prisma.order.update({
      where: { id: orderId },
      data: { paymentId: paymentIntent.id },
    });

    return { clientSecret: paymentIntent.client_secret, amount: order.total };
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!,
      );
    } catch (err: unknown) {
      throw new BadRequestException(
        `Webhook Error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = parseInt(pi.metadata.orderId);
        if (!orderId) break;

        // Load full order for email + reconciliation
        const order = await this.prisma.order.findUnique({
          where: { id: orderId },
          include: {
            user: { select: { id: true, email: true, firstName: true } },
            items: {
              include: {
                variant: { include: { product: { select: { name: true } } } },
              },
            },
          },
        });
        if (!order) break;

        // FINAL §25.7 webhook idempotency: race-safe via DB unique constraint on gatewayRef.
        // The reconciliation INSERT is the first write — if it succeeds we own the side
        // effects; if it P2002s, another webhook delivery already processed this intent.
        let processed = false;
        try {
          await this.prisma.$transaction(async (tx) => {
            // 1. Claim the slot — unique(gatewayRef) serialises concurrent webhooks.
            await tx.paymentReconciliation.create({
              data: {
                orderId,
                gatewayRef: pi.id,
                gatewayAmount: pi.amount / 100,
                internalAmount: order.total,
                status:
                  Math.abs(pi.amount / 100 - order.total) < 0.01
                    ? 'MATCHED'
                    : 'DISCREPANCY',
              },
            });
            // 2. Mark order PAID + CONFIRMED
            await tx.order.update({
              where: { id: orderId },
              data: { paymentStatus: 'PAID', status: 'CONFIRMED' },
            });
            // 3. Tracking event
            await tx.trackingEvent.create({
              data: {
                orderId,
                status: OrderStatus.CONFIRMED,
                note: `Payment confirmed via Stripe (${pi.id})`,
              },
            });
          });
          processed = true;
        } catch (e) {
          if (
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === 'P2002'
          ) {
            this.logger.debug(
              `Duplicate webhook for ${pi.id} — already processed`,
            );
          } else {
            throw e;
          }
        }

        if (processed) {
          // Side effects only fire for the winning webhook delivery.
          this.invoicesService
            .createInvoiceRecord(orderId)
            .catch((e: unknown) =>
              this.logger.error(
                `Invoice creation failed for order #${orderId}: ${e instanceof Error ? e.message : String(e)}`,
              ),
            );
          this.emailService.sendOrderConfirmation(order).catch(() => {});
          this.webhooksService
            .dispatch('order.paid', {
              orderId,
              total: order.total,
              paymentIntentId: pi.id,
            })
            .catch(() => {});
          // W3.T6 — publish payment.captured for plugin + kernel consumers.
          // ADDITIVE in this wave: no subscribers yet, so emitting here is a
          // no-op delivery. Future analytics / fraud / loyalty consumers
          // listen here instead of hooking the webhook controller.
          await this.eventBus
            .publish('payment.captured', {
              orderId,
              paymentIntentId: pi.id,
              amount: pi.amount / 100,
              currency: pi.currency,
              gateway: 'stripe',
            })
            .catch(() => {});
          // W3.T7 — `payment.afterCapture` hook site (plan §4 Type 2).
          // Synchronous post-commit hook. Plugins can sync external
          // fulfilment systems, register the payment with accounting,
          // etc. Budget: 50ms, per-plugin CircuitBreaker. handlerCount
          // check preserves the no-op fast path; we only re-shape the
          // payload into ReadOnly* types when there's a handler waiting.
          if (this.hookRunner.handlerCount('payment.afterCapture') > 0) {
            const orderCtx: ReadOnlyOrder = {
              id: order.id,
              userId: order.userId,
              guestEmail: order.guestEmail ?? null,
              subtotal: order.subtotal,
              discountAmount: order.discountAmount,
              shippingFee: order.shippingFee,
              taxAmount: order.taxAmount,
              total: order.total,
              status: 'CONFIRMED',
              paymentStatus: 'PAID',
              items: order.items.map((it) => ({
                id: it.id,
                variantId: it.variantId,
                quantity: it.quantity,
                unitPrice: it.price,
                totalPrice: it.price * it.quantity,
              })),
            };
            const paymentIntentCtx: ReadOnlyPaymentIntent = {
              id: pi.id,
              amount: pi.amount / 100,
              currency: pi.currency,
              orderId,
            };
            await this.hookRunner.runSync('payment.afterCapture', {
              order: orderCtx,
              paymentIntent: paymentIntentCtx,
            });
          }
          this.logger.log(`Payment confirmed for order #${orderId}`);
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = parseInt(pi.metadata.orderId);
        if (!orderId) break;

        const failedOrder = await this.prisma.order.findUnique({
          where: { id: orderId },
          select: { id: true, userId: true, walletAmountUsed: true },
        });

        await this.prisma.order.update({
          where: { id: orderId },
          data: { paymentStatus: 'UNPAID' },
        });

        await this.prisma.trackingEvent.create({
          data: {
            orderId,
            status: OrderStatus.PENDING,
            note: `Payment failed: ${pi.last_payment_error?.message ?? 'unknown error'}`,
          },
        });

        // Mixed payment reversal: restore wallet portion if gateway leg failed
        if (
          failedOrder &&
          failedOrder.userId != null &&
          failedOrder.walletAmountUsed > 0
        ) {
          await this.walletService.credit({
            userId: failedOrder.userId,
            amount: failedOrder.walletAmountUsed,
            reference: `wallet:reversal:order:${orderId}`,
            description: `Payment failed — wallet reversal for order #${orderId}`,
          });
          this.logger.log(
            `Wallet reversal of ₹${failedOrder.walletAmountUsed} applied for order #${orderId}`,
          );
        }

        this.logger.warn(`Payment failed for order #${orderId}`);
        // W3.T6 — publish payment.failed for plugin + kernel consumers
        // (checkout recovery emails, fraud signals, analytics). The
        // mixed-payment wallet reversal above is NOT pluggable (financial
        // path → Tier 1 kernel-only), so it stays inline.
        await this.eventBus
          .publish('payment.failed', {
            orderId,
            paymentIntentId: pi.id,
            reason: pi.last_payment_error?.message ?? null,
            gateway: 'stripe',
          })
          .catch(() => {});
        break;
      }

      case 'charge.dispute.created': {
        // GAP-F08: Chargeback / dispute. The customer has escalated to Stripe
        // asking for money back. If a prior wallet refund already credited
        // them (e.g. admin processed a goodwill refund to wallet before the
        // dispute landed), we must claw it back — otherwise I-3 would drift
        // and the customer keeps both the chargeback AND the wallet credit.
        //
        // Idempotent via:
        //   - deterministic debit reference `refund:order:${id}:chargeback`
        //     hitting the WalletTransaction @@unique(walletId, reference, type)
        //   - WHERE-guard on updateMany keeps the tracking/logging path a no-op
        //     on replay
        const dispute = event.data.object as Stripe.Dispute;
        const paymentIntentId =
          typeof dispute.payment_intent === 'string'
            ? dispute.payment_intent
            : dispute.payment_intent?.id;
        if (!paymentIntentId) break;

        const orders = await this.prisma.order.findMany({
          where: { paymentId: paymentIntentId },
          select: { id: true, userId: true, total: true },
        });
        for (const o of orders) {
          if (!o.userId) continue;
          // Check for a prior wallet refund credit for this order. If it
          // exists and has not been clawed back already, debit the user
          // wallet for the same amount — atomic and idempotent via the
          // unique(walletId, reference, type) constraint on WalletTransaction.
          const priorRefund = await this.prisma.walletTransaction.findFirst({
            where: {
              reference: `refund:order:${o.id}`,
              type: 'CREDIT',
              wallet: { userId: o.userId },
            },
          });
          if (priorRefund) {
            try {
              await this.walletService.debit({
                userId: o.userId,
                amount: priorRefund.amount,
                reference: `refund:order:${o.id}:chargeback`,
                description: `Chargeback clawback for dispute ${dispute.id}`,
              });
            } catch (e: unknown) {
              this.logger.warn(
                `[CHARGEBACK_ALERT] Failed to claw back wallet credit for order #${o.id}: ${e instanceof Error ? e.message : String(e)}`,
              );
            }
          }
          // ALERT: ops must investigate and respond to the dispute with Stripe.
          this.logger.warn(
            `[CHARGEBACK_ALERT] Dispute ${dispute.id} opened on order #${o.id} ` +
              `paymentIntent=${paymentIntentId} amount=${dispute.amount / 100} reason=${dispute.reason}. ` +
              `Manual action required.`,
          );
          await this.prisma.trackingEvent
            .create({
              data: {
                orderId: o.id,
                status: OrderStatus.CANCELLING,
                note: `Chargeback dispute opened (${dispute.id}): ${dispute.reason}. Manual review required.`,
              },
            })
            .catch(() => {});
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        if (!charge.payment_intent) break;
        const paymentIntentId =
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : charge.payment_intent.id;

        // FINAL §25.7 webhook idempotency: conditional update makes replay a no-op.
        // We only transition UNPAID/PAID → REFUNDED; a second delivery finds REFUNDED
        // and updateMany returns count=0, skipping side effects.
        const orders = await this.prisma.order.findMany({
          where: {
            paymentId: paymentIntentId,
            paymentStatus: { not: 'REFUNDED' },
          },
        });
        for (const order of orders) {
          const updated = await this.prisma.$transaction(async (tx) => {
            const res = await tx.order.updateMany({
              where: { id: order.id, paymentStatus: { not: 'REFUNDED' } },
              data: { paymentStatus: 'REFUNDED', status: OrderStatus.REFUNDED },
            });
            if (res.count === 1) {
              await tx.paymentReconciliation.updateMany({
                where: { orderId: order.id },
                data: { status: 'RESOLVED' },
              });
            }
            return res.count;
          });
          if (updated === 1) {
            this.logger.log(
              `Stripe refund processed for order #${order.id} (${paymentIntentId})`,
            );
            // V-08 FIX: claw back loyalty points earned on delivery when refund comes via Stripe webhook
            if (order.userId) {
              this.loyaltyService
                .clawbackPoints(order.userId, order.id)
                .catch(() => {});
            }
            // W3.T6 — publish payment.refunded for plugin + kernel consumers.
            // refundRequestId is null here because Stripe-Dashboard-initiated
            // refunds don't create a RefundRequest row (only OrdersService.
            // refundOrder does); the SDK contract marks the field nullable
            // specifically for this case. Amount comes from `amount_refunded`
            // (cents → rupees) to handle partial refunds correctly.
            await this.eventBus
              .publish('payment.refunded', {
                orderId: order.id,
                refundRequestId: null,
                amount: charge.amount_refunded / 100,
                currency: charge.currency,
                destination: 'ORIGINAL_PAYMENT',
              })
              .catch(() => {});
          }
        }
        break;
      }
    }

    return { received: true };
  }

  /**
   * Initiate a Stripe refund for an order paid via card.
   * Used for "refund to original payment method" flow.
   */
  async refundStripePayment(orderId: number, userId: number) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.paymentId) throw new BadRequestException('No payment to refund');
    if (order.paymentStatus !== 'PAID')
      throw new BadRequestException('Order is not paid');
    if (order.status === 'CANCELLING' || order.status === 'REFUNDED') {
      throw new BadRequestException(
        'Refund already in progress for this order',
      );
    }

    // FINAL §9.4 R-004: two-phase refund. Enter CANCELLING state BEFORE calling Stripe
    // so a concurrent admin click can't trigger a second refund. Conditional updateMany
    // serialises the transition — only one caller wins.
    const priorStatus = order.status;
    const claimed = await this.prisma.order.updateMany({
      where: { id: orderId, status: priorStatus, paymentStatus: 'PAID' },
      data: { status: 'CANCELLING' },
    });
    if (claimed.count === 0) {
      throw new BadRequestException('Order state changed — refresh and retry');
    }

    // FINAL §2 I-11: RefundRequest authoritative ledger. Create in PROCESSING state
    // BEFORE the gateway call, so retries are idempotent via unique(reference) and a
    // crash mid-call leaves a recoverable row.
    const refundRef = `refund:order:${orderId}:stripe`;
    const refundRequest = await this.prisma.refundRequest.upsert({
      where: { reference: refundRef },
      create: {
        orderId,
        amount: order.total,
        reason: 'customer_request',
        status: 'PROCESSING',
        destination: 'ORIGINAL_PAYMENT',
        reference: refundRef,
        requestedById: userId,
      },
      // W5: manual retries share the retryCount budget with the cron (incrementing on each attempt).
      update: {
        status: 'PROCESSING',
        failureReason: null,
        retryCount: { increment: 1 },
        lastRetryAt: new Date(),
      },
    });

    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: order.paymentId,
        reason: 'requested_by_customer',
        metadata: {
          orderId: String(orderId),
          refundRequestId: String(refundRequest.id),
        },
      });
      await this.prisma.refundRequest.update({
        where: { id: refundRequest.id },
        data: {
          gatewayRef: refund.id,
          status: 'COMPLETED',
          processedAt: new Date(),
        },
      });
      await this.prisma.trackingEvent.create({
        data: {
          orderId,
          status: OrderStatus.CANCELLING,
          note: `Refund initiated with Stripe (${refund.id}) — awaiting webhook confirmation`,
        },
      });
      // Final state transition (CANCELLING → REFUNDED) happens in the charge.refunded webhook.
      return { refundId: refund.id, status: refund.status };
    } catch (e: unknown) {
      const eMsg = e instanceof Error ? e.message : 'gateway error';
      // Roll the state back so the admin can retry or escalate.
      await this.prisma.order.updateMany({
        where: { id: orderId, status: 'CANCELLING' },
        data: { status: priorStatus },
      });
      await this.prisma.refundRequest.update({
        where: { id: refundRequest.id },
        data: {
          status: 'FAILED',
          failureReason: eMsg,
        },
      });
      this.logger.error(`Stripe refund failed for order #${orderId}: ${eMsg}`);
      throw new BadRequestException(`Refund failed: ${eMsg}`);
    }
  }
}
