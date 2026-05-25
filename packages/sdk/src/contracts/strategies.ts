// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * Day-1 strategy contracts (3 strategies per plan §4 + self-critique #1).
 *
 * Strategies are interfaces plugins implement to REPLACE or EXTEND a
 * specific kernel operation. Three composition modes per plan §10 E21:
 *
 *   - `single`     — one wins, kernel picks by context (e.g. payment
 *                    gateway id from order metadata)
 *   - `composable` — all run, kernel composes results (e.g. fraud score
 *                    sum)
 *   - `chained`    — kernel applies in priority order, each plugin
 *                    modifies the running value (e.g. discount stack)
 */

import type {
  ReadOnlyAddress,
  ReadOnlyOrder,
  ReadOnlyCart,
  ReadOnlyUser,
  WarehouseContext,
} from '../types/readonly';

// ─── Strategy mode tags ─────────────────────────────────────────────────────
export type StrategyMode = 'single' | 'composable' | 'chained';

export interface StrategyMeta {
  readonly id: string; // e.g. 'razorpay' for a PaymentGatewayStrategy
  readonly mode: StrategyMode;
  /** For `chained`: lower priority runs first; for `composable`: ignored. */
  readonly priority?: number;
}

// ─── PaymentGatewayStrategy (single) ────────────────────────────────────────

export interface PaymentIntentRequest {
  readonly order: ReadOnlyOrder;
  readonly amount: number;
  readonly currency: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface PaymentIntentResponse {
  readonly id: string;
  readonly clientSecret: string;
  readonly gatewayId: string;
}

export interface WebhookHandleRequest {
  readonly rawBody: Buffer;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}

export interface WebhookHandleResult {
  readonly handled: boolean;
  readonly eventType?: string;
}

export interface PaymentGatewayStrategy {
  readonly meta: StrategyMeta & { mode: 'single' };
  /** Webhook URL suffix relative to /api/payments/webhook/. */
  readonly webhookPath: string;
  createIntent(req: PaymentIntentRequest): Promise<PaymentIntentResponse>;
  handleWebhook(req: WebhookHandleRequest): Promise<WebhookHandleResult>;
}

// ─── FraudSignalStrategy (composable) ───────────────────────────────────────

export interface FraudSignalContext {
  readonly userId: number | null;
  readonly guestEmail: string | null;
  readonly ip: string | null;
  readonly cart: ReadOnlyCart;
  readonly warehouseContext: WarehouseContext;
}

/**
 * Returns a numeric risk score. Kernel sums all plugin scores plus its
 * own baseline (Stripe Radar, geo-IP, etc.) and compares to the
 * configured threshold. Score range: 0 (no signal) to 100 (definite
 * fraud).
 */
export interface FraudSignalStrategy {
  readonly meta: StrategyMeta & { mode: 'composable' };
  score(ctx: FraudSignalContext): Promise<number>;
}

// ─── DiscountStrategy (chained) ─────────────────────────────────────────────

export interface DiscountContext {
  readonly order: ReadOnlyOrder;
  readonly user: ReadOnlyUser | null; // null for guests
  readonly couponCode: string | null;
}

export interface DiscountResult {
  readonly amount: number; // INR; subtracted from order total
  readonly reason: string; // human-readable; shown in admin and audit
}

/**
 * Plugin returns a discount amount based on the running order total.
 * Kernel applies in `priority` order; each plugin sees the previous
 * plugin's discount already deducted.
 */
export interface DiscountStrategy {
  readonly meta: StrategyMeta & { mode: 'chained' };
  apply(ctx: DiscountContext): Promise<DiscountResult | null>;
}

// ─── ShippingCarrierStrategy (single) ───────────────────────────────────────

export interface ShippingRateRequest {
  readonly order: ReadOnlyOrder;
  readonly destinationPincode: string;
  readonly warehouseContext: WarehouseContext;
}

export interface ShippingRateQuote {
  readonly carrierId: string;
  readonly serviceName: string;
  readonly costINR: number;
  readonly etaDays: number;
}

export interface ShippingCarrierStrategy {
  readonly meta: StrategyMeta & { mode: 'single' };
  getRates(req: ShippingRateRequest): Promise<readonly ShippingRateQuote[]>;
}

// ─── EarnRuleStrategy (composable) ──────────────────────────────────────────

export interface EarnRuleContext {
  readonly order: ReadOnlyOrder;
  readonly user: ReadOnlyUser; // earning requires a user (no guest loyalty)
}

export interface EarnRuleStrategy {
  readonly meta: StrategyMeta & { mode: 'composable' };
  /** Returns points to credit. Kernel sums all plugin contributions. */
  earn(ctx: EarnRuleContext): Promise<number>;
}

// ─── InvoiceFormatStrategy (single) ─────────────────────────────────────────

export interface InvoiceRenderRequest {
  readonly order: ReadOnlyOrder;
  /** Bill-to billing address. */
  readonly billingAddress: ReadOnlyAddress;
  readonly invoiceNumber: string;
  readonly issuedAt: Date;
}

export interface InvoiceRenderResult {
  readonly pdf: Buffer;
  readonly fileName: string;
}

export interface InvoiceFormatStrategy {
  readonly meta: StrategyMeta & { mode: 'single' };
  render(req: InvoiceRenderRequest): Promise<InvoiceRenderResult>;
}

// ─── Aggregate registry type for runtime registration ───────────────────────

export type AnyStrategy =
  | PaymentGatewayStrategy
  | FraudSignalStrategy
  | DiscountStrategy
  | ShippingCarrierStrategy
  | EarnRuleStrategy
  | InvoiceFormatStrategy;

/**
 * Strategy type → concrete type. Used by `kernel.strategies.register<T>(...)`
 * for static guarantees.
 */
export interface StrategyTypeMap {
  PaymentGatewayStrategy: PaymentGatewayStrategy;
  FraudSignalStrategy: FraudSignalStrategy;
  DiscountStrategy: DiscountStrategy;
  ShippingCarrierStrategy: ShippingCarrierStrategy;
  EarnRuleStrategy: EarnRuleStrategy;
  InvoiceFormatStrategy: InvoiceFormatStrategy;
}

export type StrategyType = keyof StrategyTypeMap;
