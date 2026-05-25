// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * Read-only kernel projections exposed to plugins.
 *
 * Plugins receive these — NOT the full Prisma model types — to keep the
 * plugin contract decoupled from the schema. If a kernel column rename
 * happens, the SDK projection stays stable via an explicit mapping.
 *
 * Mutability rule: every field is `readonly`. Plugin code that needs to
 * mutate must use kernel SDK methods (kernel.db.<...>) which enforce
 * authz scopes (E12), audit logging (E13), and the per-plugin DB
 * semaphore (E7).
 */

/**
 * Reference to a warehouse, carrying enough context for plugins to make
 * routing/validation decisions. From day 1 this carries multiple
 * warehouses so the contract is multi-WH ready (self-critique #3 / E
 * principles).
 */
export interface WarehouseContext {
  readonly primaryWarehouseId: number;
  /** Empty in single-WH deployments (today). Populated in multi-WH (future). */
  readonly availableWarehouseIds: readonly number[];
}

export interface ReadOnlyAddress {
  readonly id: number;
  readonly fullName: string;
  readonly line1: string;
  readonly line2: string | null;
  readonly city: string;
  readonly state: string;
  readonly pincode: string;
  readonly country: string;
}

export interface ReadOnlyCartItem {
  readonly variantId: number;
  readonly quantity: number;
  readonly unitPrice: number;
}

export interface ReadOnlyCart {
  readonly id: number;
  readonly userId: number;
  readonly items: readonly ReadOnlyCartItem[];
  readonly subtotal: number;
}

export interface ReadOnlyOrderItem {
  readonly id: number;
  readonly variantId: number;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly totalPrice: number;
}

export interface ReadOnlyOrder {
  readonly id: number;
  readonly userId: number | null;
  readonly guestEmail: string | null;
  readonly subtotal: number;
  readonly discountAmount: number;
  readonly shippingFee: number;
  readonly taxAmount: number;
  readonly total: number;
  readonly status: string;
  readonly paymentStatus: string;
  readonly items: readonly ReadOnlyOrderItem[];
}

export interface ReadOnlyUser {
  readonly id: number;
  readonly email: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly role: string;
}

export interface ReadOnlyPaymentIntent {
  readonly id: string;
  readonly amount: number;
  readonly currency: string;
  readonly orderId: number;
}

/**
 * Reason returned by a pre-validation hook to reject the operation.
 * Kernel converts to a 400 BadRequest with the message.
 */
export interface RejectReason {
  readonly reject: true;
  readonly code: string;
  readonly message: string;
}
