// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * Day-1 hook contracts (5 hooks per plan §4 + self-critique #1).
 *
 * Hooks are SYNCHRONOUS extension points the kernel calls at specific
 * moments in a request lifecycle. They run with a hard timeout budget
 * (100ms pre-validation, 50ms post-commit) and a per-plugin
 * CircuitBreaker. They run OUTSIDE the kernel's $transaction blocks
 * (enforced by ESLint rule `no-hook-in-tx`).
 *
 * Returning a `RejectReason` from a pre-validation hook aborts the
 * operation with a 400 to the client. Throwing from a post-commit hook
 * is logged but does not affect the response.
 *
 * The hook name space is dotted (`<domain>.<phase>`) so consumers can
 * subscribe with autocomplete on the literal types.
 */

import type {
  ReadOnlyCart,
  ReadOnlyAddress,
  WarehouseContext,
  RejectReason,
  ReadOnlyOrder,
  ReadOnlyPaymentIntent,
} from '../types/readonly';

// ─── Hook names (string literal union; the ONLY allowed values) ─────────────
export type HookName =
  | 'order.preValidate'
  | 'order.afterPlace'
  | 'cart.beforeReserve'
  | 'payment.afterCapture'
  | 'user.beforeDelete';

// ─── Per-hook payload + return type ─────────────────────────────────────────

/**
 * Fired AFTER fraud + reservation validation, BEFORE the order $transaction.
 * Plugins can perform additional business-rule checks (regulatory limits,
 * loyalty restrictions, custom inventory holds).
 *
 * Returning `RejectReason` aborts the order with a 400.
 * Returning `void` allows the order to proceed.
 *
 * Budget: 100ms total across all registered plugins.
 */
export interface OrderPreValidateContext {
  readonly userId: number | null; // null for guest orders
  readonly cart: ReadOnlyCart;
  readonly address: ReadOnlyAddress;
  readonly warehouseContext: WarehouseContext;
  readonly couponCode: string | null;
  readonly walletAmountUsed: number;
}

export type OrderPreValidateHook = (
  ctx: OrderPreValidateContext,
) => Promise<void | RejectReason>;

/**
 * Fired AFTER the order $transaction commits, BEFORE the HTTP response.
 * Plugins can perform user-visible side effects (cache warming, immediate
 * notifications). Heavier work belongs in the `order.placed` async event.
 *
 * Throwing here does NOT roll back the order or fail the response. Errors
 * are logged + counted toward the CircuitBreaker.
 *
 * Budget: 50ms total across all registered plugins.
 */
export interface OrderAfterPlaceContext {
  readonly order: ReadOnlyOrder;
  readonly warehouseContext: WarehouseContext;
}

export type OrderAfterPlaceHook = (
  ctx: OrderAfterPlaceContext,
) => Promise<void>;

/**
 * Fired BEFORE the cart reservation transaction. Used for early rejection
 * (sold out, geographic restriction, etc.).
 *
 * Budget: 100ms.
 */
export interface CartBeforeReserveContext {
  readonly userId: number;
  readonly cart: ReadOnlyCart;
  readonly warehouseContext: WarehouseContext;
}

export type CartBeforeReserveHook = (
  ctx: CartBeforeReserveContext,
) => Promise<void | RejectReason>;

/**
 * Fired AFTER a Stripe (or future gateway) payment is captured. Plugins
 * can update external systems, trigger fulfillment workflows, etc.
 *
 * Budget: 50ms.
 */
export interface PaymentAfterCaptureContext {
  readonly order: ReadOnlyOrder;
  readonly paymentIntent: ReadOnlyPaymentIntent;
}

export type PaymentAfterCaptureHook = (
  ctx: PaymentAfterCaptureContext,
) => Promise<void>;

/**
 * Fired BEFORE the kernel deletes a user (GDPR / DPDP right-to-erasure).
 * Every plugin storing user-linked data MUST register this hook to delete
 * its rows. Failure aborts the deletion and is audited.
 *
 * Budget: 5s (heavier than other hooks because deletion can span many
 * rows in plugin tables).
 */
export interface UserBeforeDeleteContext {
  readonly userId: number;
  /** Whether this is a soft delete (data anonymisation) or hard delete. */
  readonly mode: 'soft' | 'hard';
}

export type UserBeforeDeleteHook = (
  ctx: UserBeforeDeleteContext,
) => Promise<void>;

// ─── Discriminated-union map for runtime registration ───────────────────────

/**
 * Maps each hook name to its handler signature. Used by HookRunner +
 * SDK registration helpers for full type safety.
 */
export interface HookHandlerMap {
  'order.preValidate': OrderPreValidateHook;
  'order.afterPlace': OrderAfterPlaceHook;
  'cart.beforeReserve': CartBeforeReserveHook;
  'payment.afterCapture': PaymentAfterCaptureHook;
  'user.beforeDelete': UserBeforeDeleteHook;
}

/** Per-hook budget in milliseconds. Enforced by HookRunner. */
export const HOOK_BUDGETS_MS: Readonly<Record<HookName, number>> = {
  'order.preValidate': 100,
  'order.afterPlace': 50,
  'cart.beforeReserve': 100,
  'payment.afterCapture': 50,
  'user.beforeDelete': 5_000,
};

/** Whether a hook is sync-blocking (true) or post-commit non-blocking (false). */
export const HOOK_IS_BLOCKING: Readonly<Record<HookName, boolean>> = {
  'order.preValidate': true,
  'order.afterPlace': false,
  'cart.beforeReserve': true,
  'payment.afterCapture': false,
  'user.beforeDelete': true,
};
