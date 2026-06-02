// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * Day-1 event contracts (12 events; started at 10, added `order.delivered`
 * in W3.T5 when loyalty earn migrated from inline `OrdersService.update
 * OrderStatus(DELIVERED)` call to an event subscriber; added `payment.
 * failed` in W3.T6 when the Stripe webhook handler started publishing
 * payment-lifecycle events).
 *
 * Events are ASYNCHRONOUS pub/sub via BullMQ topic queues. Kernel
 * publishes; plugins subscribe. Multiple consumers per event. No
 * ordering guarantees across consumers (consumers derive order from
 * payload `version` + `occurredAt` if needed).
 *
 * Every event carries:
 *   - `version`: schema version; consumers tolerate forward-compatible
 *     additions
 *   - `occurredAt`: ISO timestamp when the event was emitted
 *   - `traceparent`: W3C trace context for OTel propagation
 *
 * Adding a new event is a SemVer minor. Renaming or removing a field
 * requires a deprecation cycle (one release with both names).
 */

// ─── Event name union ───────────────────────────────────────────────────────
export type EventName =
  | 'order.placed'
  | 'order.cancelled'
  | 'order.delivered'
  | 'payment.captured'
  | 'payment.failed'
  | 'payment.refunded'
  | 'wallet.credited'
  | 'wallet.debited'
  | 'cart.abandoned'
  | 'user.registered'
  | 'product.priceChanged'
  | 'inventory.lowStock';

// ─── Common envelope ────────────────────────────────────────────────────────

export interface EventEnvelope {
  readonly name: EventName;
  /** Schema version of this event payload. Bump on breaking change. */
  readonly version: 1;
  readonly occurredAt: string; // ISO 8601
  /** W3C traceparent header for OTel context propagation. */
  readonly traceparent?: string;
}

// ─── Per-event payloads ─────────────────────────────────────────────────────

export interface OrderPlacedEvent extends EventEnvelope {
  readonly name: 'order.placed';
  readonly orderId: number;
  readonly userId: number | null;
  readonly guestEmail: string | null;
  readonly total: number;
  readonly couponCode: string | null;
  readonly itemCount: number;
}

export interface OrderCancelledEvent extends EventEnvelope {
  readonly name: 'order.cancelled';
  readonly orderId: number;
  readonly userId: number | null;
  readonly reason: string | null;
}

/**
 * Emitted when an order transitions to DELIVERED. Subscribers earn loyalty
 * points (kernel.loyalty), pay first-delivery referral bonuses (referral
 * plugin in a later wave), and trigger NPS surveys / review-prompt emails.
 *
 * `total` carries the order total at delivery time so subscribers don't
 * have to re-fetch the Order row just to compute loyalty earn.
 */
export interface OrderDeliveredEvent extends EventEnvelope {
  readonly name: 'order.delivered';
  readonly orderId: number;
  readonly userId: number | null;
  readonly total: number;
}

export interface PaymentCapturedEvent extends EventEnvelope {
  readonly name: 'payment.captured';
  readonly orderId: number;
  readonly paymentIntentId: string;
  readonly amount: number;
  readonly currency: string;
  readonly gateway: string; // 'stripe' | 'razorpay' | etc.
}

/**
 * Emitted when a Stripe `payment_intent.payment_failed` webhook lands.
 * Subscribers may surface checkout-recovery emails, fraud signals, or
 * analytics. Wallet reversal for mixed payments stays in the kernel
 * webhook handler (financial path — not pluggable per Tier 1 policy).
 */
export interface PaymentFailedEvent extends EventEnvelope {
  readonly name: 'payment.failed';
  readonly orderId: number;
  readonly paymentIntentId: string;
  readonly reason: string | null;
  readonly gateway: string;
}

export interface PaymentRefundedEvent extends EventEnvelope {
  readonly name: 'payment.refunded';
  readonly orderId: number;
  /**
   * Null when the refund originated outside the in-app refund flow
   * (e.g., Stripe Dashboard manual refund → `charge.refunded` webhook):
   * no `RefundRequest` row exists in that case. Non-null when the
   * refund came from `OrdersService.refundOrder` / `refundOrderItem`.
   */
  readonly refundRequestId: number | null;
  readonly amount: number;
  readonly currency: string;
  readonly destination: 'ORIGINAL_PAYMENT' | 'WALLET';
}

export interface WalletCreditedEvent extends EventEnvelope {
  readonly name: 'wallet.credited';
  readonly userId: number;
  readonly amount: number;
  readonly newBalance: number;
  readonly reference: string;
}

export interface WalletDebitedEvent extends EventEnvelope {
  readonly name: 'wallet.debited';
  readonly userId: number;
  readonly amount: number;
  readonly newBalance: number;
  readonly reference: string;
}

export interface CartAbandonedEvent extends EventEnvelope {
  readonly name: 'cart.abandoned';
  readonly userId: number | null;
  readonly guestEmail: string | null;
  readonly itemCount: number;
  readonly cartValue: number;
}

export interface UserRegisteredEvent extends EventEnvelope {
  readonly name: 'user.registered';
  readonly userId: number;
  readonly email: string;
  readonly referralCode: string | null;
}

export interface ProductPriceChangedEvent extends EventEnvelope {
  readonly name: 'product.priceChanged';
  readonly productId: number;
  readonly oldPrice: number;
  readonly newPrice: number;
  readonly oldDiscountPct: number;
  readonly newDiscountPct: number;
}

export interface InventoryLowStockEvent extends EventEnvelope {
  readonly name: 'inventory.lowStock';
  readonly variantId: number;
  readonly warehouseId: number;
  readonly currentStock: number;
  readonly threshold: number;
}

// ─── Discriminated union for type-safe handlers ─────────────────────────────

export type KernelEvent =
  | OrderPlacedEvent
  | OrderCancelledEvent
  | OrderDeliveredEvent
  | PaymentCapturedEvent
  | PaymentFailedEvent
  | PaymentRefundedEvent
  | WalletCreditedEvent
  | WalletDebitedEvent
  | CartAbandonedEvent
  | UserRegisteredEvent
  | ProductPriceChangedEvent
  | InventoryLowStockEvent;

/** Maps each event name to its full payload type. */
export interface EventPayloadMap {
  'order.placed': OrderPlacedEvent;
  'order.cancelled': OrderCancelledEvent;
  'order.delivered': OrderDeliveredEvent;
  'payment.captured': PaymentCapturedEvent;
  'payment.failed': PaymentFailedEvent;
  'payment.refunded': PaymentRefundedEvent;
  'wallet.credited': WalletCreditedEvent;
  'wallet.debited': WalletDebitedEvent;
  'cart.abandoned': CartAbandonedEvent;
  'user.registered': UserRegisteredEvent;
  'product.priceChanged': ProductPriceChangedEvent;
  'inventory.lowStock': InventoryLowStockEvent;
}

/** Async consumer signature for any kernel event. */
export type EventConsumer<E extends EventName> = (
  event: EventPayloadMap[E],
) => Promise<void>;
