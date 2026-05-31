// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * Shared Prisma client for integration tests + helpers to seed and clean test data.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// Single Prisma client for the entire test run, stored in globalThis so it
// survives Jest's per-spec module registry resets (--runInBand, same process).
// This caps total DB connections at 3 regardless of how many spec files run,
// instead of 39 × 3 = 117 which exceeds PostgreSQL's max_connections=100.
declare global {
  // eslint-disable-next-line no-var
  var __testPrisma: PrismaClient | undefined;
}
if (!global.__testPrisma) {
  global.__testPrisma = new PrismaClient();
}
export const prisma: PrismaClient = global.__testPrisma;

/**
 * Task 8 / POST_W6 §3.2 narrow swallow.
 *
 * Replaces the older `.catch(ignoreMissingTable)` blanket pattern in cleanDatabase.
 * The blanket caused PAY-E02 (Invoice + RefundApproval FK violations
 * masked) and could be hiding other real failures the same way.
 *
 * P2021 = "The table `X` does not exist in the current database."
 * Prisma surfaces this when:
 *   - A table referenced in the schema hasn't been migrated yet
 *   - An old migration baseline doesn't include a Phase-2+ table
 *
 * Anything else (FK violations, connection errors, syntax errors, etc.)
 * MUST surface so the test investigator sees the actual problem at
 * the actual call site, not as a cascading failure ten lines later.
 *
 * Usage: `await prisma.foo.deleteMany().catch(ignoreMissingTable);`
 */
export function ignoreMissingTable(err: unknown): void {
  const code = (err as { code?: string } | null)?.code;
  if (code === 'P2021') return; // table doesn't exist — fine, nothing to delete
  throw err;
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

/**
 * Deletes all rows in the correct FK-safe order.
 * Call in beforeEach to isolate tests.
 */
export async function cleanDatabase(): Promise<void> {
  // ── Leaf / junction tables first (no other table FKs into these) ──────────
  await prisma.review.deleteMany();
  await prisma.wishlist.deleteMany();
  // Phase-2+ models that FK-constrain Order/User/Product
  await prisma.notification.deleteMany().catch(ignoreMissingTable);
  await prisma.recentlyViewed.deleteMany().catch(ignoreMissingTable);
  await prisma.exchangeRequest.deleteMany().catch(ignoreMissingTable);
  await prisma.deliveryRating.deleteMany().catch(ignoreMissingTable);
  await prisma.productQuestion.deleteMany().catch(ignoreMissingTable);
  await prisma.priceAlert.deleteMany().catch(ignoreMissingTable);
  await prisma.priceHistory.deleteMany().catch(ignoreMissingTable);
  await prisma.volumeDiscount.deleteMany().catch(ignoreMissingTable);
  await prisma.searchLog.deleteMany().catch(ignoreMissingTable);
  await prisma.blogPost.deleteMany().catch(ignoreMissingTable);
  // Return / refund chain
  await prisma.returnItem.deleteMany().catch(ignoreMissingTable);
  await prisma.returnRequest.deleteMany().catch(ignoreMissingTable);
  // Loyalty / tracking
  await prisma.loyaltyTransaction.deleteMany().catch(ignoreMissingTable);
  await prisma.trackingEvent.deleteMany().catch(ignoreMissingTable);
  await prisma.ledgerEntry.deleteMany().catch(ignoreMissingTable);
  await prisma.paymentReconciliation.deleteMany().catch(ignoreMissingTable);
  // Cart reservations
  await prisma.cartReservationItem.deleteMany().catch(ignoreMissingTable);
  await prisma.cartReservation.deleteMany().catch(ignoreMissingTable);
  // Wallet
  await prisma.walletTransaction.deleteMany().catch(ignoreMissingTable);
  await prisma.refundRequest.deleteMany().catch(ignoreMissingTable);
  await prisma.wallet.deleteMany().catch(ignoreMissingTable);
  // Misc user-linked
  await prisma.abandonedCart.deleteMany().catch(ignoreMissingTable);
  await prisma.referralCredit.deleteMany().catch(ignoreMissingTable);
  await prisma.couponUsage.deleteMany().catch(ignoreMissingTable);
  // Shipments
  await prisma.shipmentItem.deleteMany().catch(ignoreMissingTable);
  await prisma.shipment.deleteMany().catch(ignoreMissingTable);
  // Fraud
  await prisma.fraudFlag.deleteMany().catch(ignoreMissingTable);
  await prisma.userRiskScore.deleteMany().catch(ignoreMissingTable);
  await prisma.blacklist.deleteMany().catch(ignoreMissingTable);
  // Flash sales
  await prisma.flashSaleProduct.deleteMany().catch(ignoreMissingTable);
  await prisma.flashSale.deleteMany().catch(ignoreMissingTable);
  // Orders
  await prisma.orderItem.deleteMany();
  // W6.T-flakes PAY-E02 cleanup: do NOT swallow Invoice / RefundApproval
  // DELETE failures. The previous `.catch(ignoreMissingTable)` masked rare
  // failures here and surfaced them downstream as
  // `order.deleteMany()` FK violations (Invoice.orderId references
  // Order.id with NO cascade). Letting the raw delete throw means
  // investigators see the actual problem at the actual call site.
  await prisma.$executeRaw`DELETE FROM "Invoice"`;
  await prisma.$executeRaw`DELETE FROM "RefundApproval"`;
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  // Inventory before Variant
  await prisma.warehouseInventory.deleteMany().catch(ignoreMissingTable);
  await prisma.variant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.address.deleteMany();
  await prisma.coupon.deleteMany();
  // Admin audit log FKs to User
  await prisma.$executeRaw`DELETE FROM "AdminAuditLog"`.catch(ignoreMissingTable);
  await prisma.user.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.category.deleteMany();
  // Delivery / invoice infrastructure (no FK to user — can delete anytime)
  await prisma.pincodeServiceability.deleteMany().catch(ignoreMissingTable);
  await prisma.deliverySlot.deleteMany().catch(ignoreMissingTable);
  await prisma.$executeRaw`DELETE FROM "InvoiceSequence"`.catch(ignoreMissingTable);
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

export async function createUser(overrides: {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  role?: 'USER' | 'ADMIN';
} = {}) {
  const plain = overrides.password ?? 'Test@1234';
  const hashed = await bcrypt.hash(plain, 10);
  return prisma.user.create({
    data: {
      email: overrides.email ?? `user_${Date.now()}@test.com`,
      password: hashed,
      firstName: overrides.firstName ?? 'Test',
      lastName: overrides.lastName ?? 'User',
      role: overrides.role ?? 'USER',
    },
  });
}

export async function createAdminUser(overrides: { email?: string; password?: string } = {}) {
  return createUser({ ...overrides, role: 'ADMIN' });
}

/** Create a user with any Role enum value (CS_AGENT, FINANCE, OPS, MERCH, SUPER_ADMIN, etc.). */
export async function createUserByRole(
  role: string,
  overrides: { email?: string; password?: string } = {},
) {
  const plain = overrides.password ?? 'Test@1234';
  const hashed = await bcrypt.hash(plain, 10);
  return prisma.user.create({
    data: {
      email: overrides.email ?? `${role.toLowerCase().replace('_', '-')}_${Date.now()}@test.com`,
      password: hashed,
      firstName: role,
      lastName: 'User',
      role: role as any,
    },
  });
}

export async function createCategory(overrides: { name?: string; slug?: string } = {}) {
  const suffix = Date.now();
  return prisma.category.create({
    data: {
      name: overrides.name ?? `Category ${suffix}`,
      slug: overrides.slug ?? `category-${suffix}`,
    },
  });
}

export async function createBrand(overrides: { name?: string; slug?: string } = {}) {
  const suffix = Date.now();
  return prisma.brand.create({
    data: {
      name: overrides.name ?? `Brand ${suffix}`,
      slug: overrides.slug ?? `brand-${suffix}`,
    },
  });
}

export async function createProduct(
  categoryId: number,
  brandId: number,
  overrides: Partial<{
    name: string;
    slug: string;
    basePrice: number;
    discountPct: number;
    isActive: boolean;
  }> = {},
) {
  const suffix = Date.now();
  return prisma.product.create({
    data: {
      name: overrides.name ?? `Product ${suffix}`,
      slug: overrides.slug ?? `product-${suffix}`,
      description: 'A test product',
      categoryId,
      brandId,
      basePrice: overrides.basePrice ?? 1000,
      discountPct: overrides.discountPct ?? 0,
      images: ['https://example.com/img.jpg'],
      tags: ['test'],
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function createVariant(
  productId: number,
  overrides: Partial<{ size: string; color: string; stock: number; sku: string }> = {},
) {
  const suffix = Date.now();
  const stock = overrides.stock ?? 10;
  const variant = await prisma.variant.create({
    data: {
      productId,
      size: overrides.size ?? 'M',
      color: overrides.color ?? 'Red',
      stock,
      sku: overrides.sku ?? `SKU-${suffix}`,
    },
  });

  // Ensure DEFAULT warehouse + WarehouseInventory exist so cart reservation works.
  const wh = await prisma.warehouse.upsert({
    where: { code: 'DEFAULT' },
    update: {},
    create: { name: 'Default Warehouse', code: 'DEFAULT', city: 'Mumbai', state: 'Maharashtra', pincode: '400001', isActive: true },
  });
  await prisma.warehouseInventory.upsert({
    where: { warehouseId_variantId: { warehouseId: wh.id, variantId: variant.id } },
    update: { stock },
    create: { warehouseId: wh.id, variantId: variant.id, stock, reserved: 0 },
  });

  return variant;
}

export async function createAddress(userId: number) {
  return prisma.address.create({
    data: {
      userId,
      fullName: 'Test User',
      phone: '9999999999',
      line1: '123 Test Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      isDefault: true,
    },
  });
}

export async function createCoupon(overrides: Partial<{
  code: string;
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: number;
  minOrderAmount: number;
  maxUses: number | null;
  isActive: boolean;
  expiresAt: Date | null;
  firstOrderOnly: boolean;
}> = {}) {
  return prisma.coupon.create({
    data: {
      code: overrides.code ?? `COUP${Date.now()}`,
      discountType: overrides.discountType ?? 'PERCENTAGE',
      discountValue: overrides.discountValue ?? 10,
      minOrderAmount: overrides.minOrderAmount ?? 0,
      maxUses: overrides.maxUses !== undefined ? overrides.maxUses : null,
      isActive: overrides.isActive ?? true,
      expiresAt: overrides.expiresAt !== undefined ? overrides.expiresAt : null,
      firstOrderOnly: overrides.firstOrderOnly ?? false,
    },
  });
}

/** Seed a cart with one item for a user. Returns { cart, cartItem }. */
export async function seedCart(userId: number, variantId: number, quantity = 2) {
  const cart = await prisma.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
  const cartItem = await prisma.cartItem.create({
    data: { cartId: cart.id, variantId, quantity },
  });
  return { cart, cartItem };
}
