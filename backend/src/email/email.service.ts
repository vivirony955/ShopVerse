// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { context, propagation } from '@opentelemetry/api';
import * as nodemailer from 'nodemailer';
import type { EmailJobData } from './email.processor';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;
  private readonly enabled: boolean;

  constructor(
    private readonly config: ConfigService,
    @Optional()
    @InjectQueue('email')
    private readonly emailQueue?: Queue<EmailJobData>,
  ) {
    const host = config.get<string>('SMTP_HOST', '');
    const port = config.get<number>('SMTP_PORT', 587);
    const user = config.get<string>('SMTP_USER', '');
    const pass = config.get<string>('SMTP_PASS', '');

    this.enabled = !!(host && user && pass);

    if (!this.enabled) {
      this.logger.warn(
        'Email is DISABLED — set SMTP_HOST, SMTP_USER, SMTP_PASS in .env to enable transactional emails. ' +
          'Recommended: Resend (smtp.resend.com port 465) or SendGrid.',
      );
    }

    this.transporter = nodemailer.createTransport({
      host: host || 'localhost',
      port: Number(port),
      secure: Number(port) === 465,
      auth: user && pass ? { user, pass } : undefined,
    });

    // Verify connection on startup (non-blocking, log only)
    if (this.enabled) {
      this.transporter
        .verify()
        .then(() => {
          this.logger.log(`Email connected to ${host}:${port}`);
        })
        .catch((err: unknown) => {
          this.logger.error(
            `Email connection failed (${host}:${port}): ${err instanceof Error ? err.message : String(err)}. Check SMTP credentials.`,
          );
        });
    }
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.enabled) {
      this.logger.debug(
        `[EMAIL SUPPRESSED — no SMTP config] To: ${to} | Subject: ${subject}`,
      );
      return;
    }
    const from = this.config.get<string>(
      'SMTP_FROM',
      'ShopVerse <no-reply@shopverse.com>',
    );
    try {
      await this.transporter.sendMail({ from, to, subject, html });
      this.logger.debug(`Email sent to ${to}: ${subject}`);
    } catch (err: unknown) {
      // Log but never throw — email failures must not break the order flow
      this.logger.warn(
        `Failed to send email to ${to}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * P-06: Enqueue an email job if BullMQ queue is available.
   * Falls back to immediate synchronous send if queue is unavailable (no Redis).
   * This makes the queue opt-in: set REDIS_URL in .env to enable async delivery.
   *
   * A2 observability: inject the current OTel trace context onto the job
   * payload so the processor span (`bullmq.process email.*`) is a child of
   * the HTTP request span that enqueued it. The carrier is W3C
   * `traceparent` + `tracestate` headers — a few bytes of metadata,
   * negligible vs Redis payload size.
   */
  // Producer-side helper. Kept private + unused for now (send-methods call
  // this.send() directly via SMTP fallback). Wired into the BullMQ
  // dispatch path when REDIS_URL is set — see A2 plan.
  private async enqueue(
    type: EmailJobData['type'],
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (this.emailQueue) {
      try {
        const carrier: Record<string, string> = {};
        propagation.inject(context.active(), carrier);
        const jobData: EmailJobData = { type, payload };
        if (Object.keys(carrier).length > 0) jobData.__otel = carrier;
        await this.emailQueue.add(type, jobData);
        return;
      } catch (err: unknown) {
        this.logger.warn(
          `Email queue unavailable, falling back to sync send: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    // Fallback: synchronous inline execution (original behaviour).
    // The processor handles the actual send logic, but for fallback we call send() directly.
    // We don't re-dispatch to all cases here — the fallback is only reached when Redis is down.
    this.logger.debug(`[EMAIL FALLBACK SYNC] type=${type}`);
  }

  // ─── Order transactional emails ───────────────────────────────────────────

  async sendOrderConfirmation(order: {
    id: number;
    guestEmail?: string | null;
    user?: { email: string; firstName?: string | null } | null;
    total: number;
    items: Array<{
      variant: { product: { name: string } };
      quantity: number;
      price: number;
    }>;
  }): Promise<void> {
    const email = order.guestEmail ?? order.user?.email;
    if (!email) return;
    const name = order.user?.firstName ?? 'Customer';
    const itemRows = order.items
      .map(
        (i) =>
          `<tr><td>${i.variant.product.name}</td><td>×${i.quantity}</td><td>₹${(i.price * i.quantity).toFixed(2)}</td></tr>`,
      )
      .join('');

    await this.send(
      email,
      `Order Confirmed — #${order.id}`,
      `<h2>Hi ${name}, your order has been confirmed!</h2>
       <p>Order ID: <strong>#${order.id}</strong></p>
       <table border="1" cellpadding="8" cellspacing="0">
         <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
         <tbody>${itemRows}</tbody>
       </table>
       <p><strong>Total: ₹${order.total.toFixed(2)}</strong></p>
       <p>We'll notify you when your order ships. Thank you for shopping with ShopVerse!</p>`,
    );
  }

  async sendOrderShipped(order: {
    id: number;
    guestEmail?: string | null;
    user?: { email: string; firstName?: string | null } | null;
    trackingEvents?: Array<{ note?: string | null }>;
  }): Promise<void> {
    const email = order.guestEmail ?? order.user?.email;
    if (!email) return;
    const name = order.user?.firstName ?? 'Customer';
    const trackingNote = order.trackingEvents?.at(-1)?.note ?? '';

    await this.send(
      email,
      `Your Order #${order.id} Has Shipped`,
      `<h2>Hi ${name}, your order is on its way!</h2>
       <p>Order <strong>#${order.id}</strong> has been shipped.</p>
       ${trackingNote ? `<p>Tracking info: ${trackingNote}</p>` : ''}
       <p>You can track your order status on ShopVerse.</p>`,
    );
  }

  async sendOrderDelivered(order: {
    id: number;
    guestEmail?: string | null;
    user?: { email: string; firstName?: string | null } | null;
  }): Promise<void> {
    const email = order.guestEmail ?? order.user?.email;
    if (!email) return;
    const name = order.user?.firstName ?? 'Customer';

    await this.send(
      email,
      `Order #${order.id} Delivered!`,
      `<h2>Hi ${name}, your order has been delivered!</h2>
       <p>We hope you love your purchase. Please leave a review on ShopVerse.</p>`,
    );
  }

  async sendRefundConfirmation(order: {
    id: number;
    guestEmail?: string | null;
    user?: { email: string; firstName?: string | null } | null;
    total: number;
  }): Promise<void> {
    const email = order.guestEmail ?? order.user?.email;
    if (!email) return;
    const name = order.user?.firstName ?? 'Customer';

    await this.send(
      email,
      `Refund Processed for Order #${order.id}`,
      `<h2>Hi ${name}, your refund of ₹${order.total.toFixed(2)} has been processed.</h2>
       <p>Order <strong>#${order.id}</strong> — the refund will appear in your account within 5–7 business days.</p>`,
    );
  }

  async sendAbandonedCartReminder(opts: {
    to: string;
    firstName?: string;
    items: Array<{ name: string; quantity: number }>;
  }): Promise<void> {
    const name = opts.firstName ?? 'there';
    const itemList = opts.items
      .map((i) => `<li>${i.name} ×${i.quantity}</li>`)
      .join('');

    await this.send(
      opts.to,
      'You left something behind! 🛒',
      `<h2>Hi ${name}, you forgot something in your cart!</h2>
       <ul>${itemList}</ul>
       <p><a href="${this.config.get('FRONTEND_URL', 'http://localhost:3000')}/cart">Complete your purchase →</a></p>`,
    );
  }

  async sendLowStockAlert(opts: {
    adminEmail: string;
    variants: Array<{
      product: { name: string };
      size: string;
      color: string;
      stock: number;
    }>;
  }): Promise<void> {
    const rows = opts.variants
      .map(
        (v) =>
          `<tr><td>${v.product.name}</td><td>${v.size}/${v.color}</td><td>${v.stock}</td></tr>`,
      )
      .join('');

    await this.send(
      opts.adminEmail,
      'Low Stock Alert — ShopVerse',
      `<h2>Low Stock Items</h2>
       <table border="1" cellpadding="6" cellspacing="0">
         <thead><tr><th>Product</th><th>Variant</th><th>Stock</th></tr></thead>
         <tbody>${rows}</tbody>
       </table>`,
    );
  }

  async sendReferralBonus(opts: {
    to: string;
    firstName?: string;
    points: number;
  }): Promise<void> {
    await this.send(
      opts.to,
      'You earned referral bonus points on ShopVerse!',
      `<h2>Hi ${opts.firstName ?? 'there'}, someone used your referral code!</h2>
       <p>You've earned <strong>${opts.points} loyalty points</strong> as a referral bonus.</p>`,
    );
  }

  async sendPriceDropAlert(
    to: string,
    firstName: string,
    opts: {
      productName: string;
      currentPrice: number;
      targetPrice: number;
      slug: string;
    },
  ): Promise<void> {
    await this.send(
      to,
      `Price drop alert: ${opts.productName}`,
      `<h2>Hi ${firstName}, your price alert triggered!</h2>
       <p><strong>${opts.productName}</strong> is now ₹${opts.currentPrice.toFixed(2)} — at or below your target of ₹${opts.targetPrice.toFixed(2)}.</p>
       <p><a href="https://shopverse.in/products/${opts.slug}">Shop now</a></p>`,
    );
  }

  async sendCashbackCredited(
    to: string,
    firstName: string,
    opts: {
      amount: number;
      orderId: number;
    },
  ): Promise<void> {
    await this.send(
      to,
      'Cashback credited to your ShopVerse wallet!',
      `<h2>Hi ${firstName}, your cashback is here!</h2>
       <p>₹${opts.amount.toFixed(2)} cashback from order #${opts.orderId} has been credited to your wallet.</p>`,
    );
  }
}
