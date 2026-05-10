/**
 * Shared Prisma client for integration tests + helpers to seed and clean test data.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

export const prisma = new PrismaClient();

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
  await prisma.notification.deleteMany().catch(() => {});
  await prisma.recentlyViewed.deleteMany().catch(() => {});
  await prisma.exchangeRequest.deleteMany().catch(() => {});
  await prisma.deliveryRating.deleteMany().catch(() => {});
  await prisma.productQuestion.deleteMany().catch(() => {});
  await prisma.priceAlert.deleteMany().catch(() => {});
  await prisma.priceHistory.deleteMany().catch(() => {});
  await prisma.volumeDiscount.deleteMany().catch(() => {});
  await prisma.searchLog.deleteMany().catch(() => {});
  await prisma.blogPost.deleteMany().catch(() => {});
  // Return / refund chain
  await prisma.returnItem.deleteMany().catch(() => {});
  await prisma.returnRequest.deleteMany().catch(() => {});
  // Loyalty / tracking
  await prisma.loyaltyTransaction.deleteMany().catch(() => {});
  await prisma.trackingEvent.deleteMany().catch(() => {});
  await prisma.ledgerEntry.deleteMany().catch(() => {});
  await prisma.paymentReconciliation.deleteMany().catch(() => {});
  // Cart reservations
  await prisma.cartReservationItem.deleteMany().catch(() => {});
  await prisma.cartReservation.deleteMany().catch(() => {});
  // Wallet
  await prisma.walletTransaction.deleteMany().catch(() => {});
  await prisma.refundRequest.deleteMany().catch(() => {});
  await prisma.wallet.deleteMany().catch(() => {});
  // Misc user-linked
  await prisma.abandonedCart.deleteMany().catch(() => {});
  await prisma.referralCredit.deleteMany().catch(() => {});
  await prisma.couponUsage.deleteMany().catch(() => {});
  // Shipments
  await prisma.shipmentItem.deleteMany().catch(() => {});
  await prisma.shipment.deleteMany().catch(() => {});
  // Fraud
  await prisma.fraudFlag.deleteMany().catch(() => {});
  await prisma.userRiskScore.deleteMany().catch(() => {});
  await prisma.blacklist.deleteMany().catch(() => {});
  // Flash sales
  await prisma.flashSaleProduct.deleteMany().catch(() => {});
  await prisma.flashSale.deleteMany().catch(() => {});
  // Orders
  await prisma.orderItem.deleteMany();
  await prisma.$executeRaw`DELETE FROM "Invoice"`.catch(() => {});
  await prisma.$executeRaw`DELETE FROM "RefundApproval"`.catch(() => {});
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  // Inventory before Variant
  await prisma.warehouseInventory.deleteMany().catch(() => {});
  await prisma.variant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.address.deleteMany();
  await prisma.coupon.deleteMany();
  // Admin audit log FKs to User
  await prisma.$executeRaw`DELETE FROM "AdminAuditLog"`.catch(() => {});
  await prisma.user.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.category.deleteMany();
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
