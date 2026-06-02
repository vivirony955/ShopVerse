// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * QA Phase-1 — composite factories for scenarios that need the full
 * warehouse/inventory/reservation/wallet graph in one call.
 *
 * Thin layer on top of db.ts. Existing tests keep using db.ts primitives;
 * new QA specs use these factories to avoid 30-line setup blocks.
 *
 * All factories are idempotent at the level of "call with same overrides
 * and you get a new independent row" — they do NOT try to upsert.
 */
import { PrismaClient } from '@prisma/client';
import {
  prisma,
  createUser,
  createCategory,
  createBrand,
  createProduct,
  createVariant,
  createAddress,
  seedCart,
} from './db';

// ─── Warehouse + inventory ───────────────────────────────────────────────────

/**
 * Ensure the DEFAULT warehouse exists (CartReservationService looks it up by
 * code='DEFAULT'). Idempotent. Returns the warehouse id.
 */
export async function ensureDefaultWarehouse(): Promise<number> {
  const existing = await prisma.warehouse.findUnique({ where: { code: 'DEFAULT' } });
  if (existing) return existing.id;
  const wh = await prisma.warehouse.create({
    data: {
      code: 'DEFAULT',
      name: 'Default Warehouse',
      pincode: '400001',
      city: 'Mumbai',
      state: 'Maharashtra',
      isActive: true,
    },
  });
  return wh.id;
}

/**
 * Upsert a `WarehouseInventory` row AND write-through the `Variant` cache
 * so I-1 holds out of the box. Use this instead of poking Variant.stock
 * directly — otherwise your tests start with a baseline I-1 violation.
 */
export async function seedInventory(
  warehouseId: number,
  variantId: number,
  stock: number,
  reserved = 0,
): Promise<void> {
  await prisma.warehouseInventory.upsert({
    where: { warehouseId_variantId: { warehouseId, variantId } },
    update: { stock, reserved },
    create: { warehouseId, variantId, stock, reserved },
  });
  // Sync Variant write-through cache to keep I-1 clean at setup time.
  await prisma.variant.update({
    where: { id: variantId },
    data: { stock, reservedStock: reserved },
  });
}

// ─── Wallet ──────────────────────────────────────────────────────────────────

export async function ensureWallet(userId: number, balance = 0): Promise<number> {
  // Seed wallet AND a matching CREDIT WalletTransaction so I-3
  // (trial balance) holds out of the box. Without the seed tx,
  // assertI3() would flag every test that uses a non-zero starting
  // balance.
  const existing = await prisma.wallet.findUnique({ where: { userId } });
  if (existing) {
    // Adjust to the requested balance via a delta CREDIT/DEBIT so the
    // ledger stays consistent.
    if (existing.balance !== balance) {
      const delta = balance - existing.balance;
      await prisma.$transaction(async (tx) => {
        await tx.wallet.update({ where: { id: existing.id }, data: { balance } });
        if (delta !== 0) {
          await tx.walletTransaction.create({
            data: {
              walletId: existing.id,
              amount: Math.abs(delta),
              type: delta > 0 ? 'CREDIT' : 'DEBIT',
              reference: `seed:adjust:${existing.id}:${Date.now()}`,
              balanceAfter: balance,
            },
          });
        }
      });
    }
    return existing.id;
  }
  const w = await prisma.wallet.create({ data: { userId, balance } });
  if (balance !== 0) {
    await prisma.walletTransaction.create({
      data: {
        walletId: w.id,
        amount: balance,
        type: 'CREDIT',
        reference: `seed:init:${w.id}`,
        balanceAfter: balance,
      },
    });
  }
  return w.id;
}

// ─── One-shot shopper setup ──────────────────────────────────────────────────

export interface ShopperFixture {
  user: { id: number; email: string };
  address: { id: number };
  product: { id: number };
  variant: { id: number };
  warehouseId: number;
  cartId: number;
  cartItemId: number;
}

/**
 * Builds the full graph a checkout test needs:
 *   DEFAULT warehouse → category → brand → product → variant → WI row
 *   → user → address → wallet(0) → cart with 1 item
 *
 * Returns everything the caller needs so a scenario can jump straight
 * to `createReservation(user.id)` without more setup.
 *
 * Keeps all names unique per call (suffixed with Date.now()+random) so
 * parallel tests can run it concurrently.
 */
export async function makeShopper(opts: {
  stock?: number;
  reserved?: number;
  basePrice?: number;
  discountPct?: number;
  cartQty?: number;
  walletBalance?: number;
} = {}): Promise<ShopperFixture> {
  const warehouseId = await ensureDefaultWarehouse();
  const category = await createCategory();
  const brand = await createBrand();
  const product = await createProduct(category.id, brand.id, {
    basePrice: opts.basePrice ?? 1000,
    discountPct: opts.discountPct ?? 0,
  });
  const variant = await createVariant(product.id, {
    stock: opts.stock ?? 50,
  });
  await seedInventory(warehouseId, variant.id, opts.stock ?? 50, opts.reserved ?? 0);
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const user = await createUser({ email: `shopper_${suffix}@test.com` });
  const address = await createAddress(user.id);
  await ensureWallet(user.id, opts.walletBalance ?? 0);
  const { cart, cartItem } = await seedCart(user.id, variant.id, opts.cartQty ?? 1);
  return {
    user: { id: user.id, email: user.email },
    address: { id: address.id },
    product: { id: product.id },
    variant: { id: variant.id },
    warehouseId,
    cartId: cart.id,
    cartItemId: cartItem.id,
  };
}

/**
 * For concurrency tests: build N independent shoppers against the SAME
 * variant/WI row (so they fight over the same stock). Returns the shared
 * warehouseId + variantId and an array of N user/cart pairs.
 */
export async function makeShoppersOnSameSKU(
  n: number,
  opts: { stock: number; cartQty?: number },
): Promise<{
  warehouseId: number;
  variantId: number;
  shoppers: { userId: number; cartId: number }[];
}> {
  const warehouseId = await ensureDefaultWarehouse();
  const category = await createCategory();
  const brand = await createBrand();
  const product = await createProduct(category.id, brand.id);
  const variant = await createVariant(product.id, { stock: opts.stock });
  await seedInventory(warehouseId, variant.id, opts.stock, 0);

  const shoppers: { userId: number; cartId: number }[] = [];
  for (let i = 0; i < n; i++) {
    const suffix = `${Date.now()}_${i}_${Math.floor(Math.random() * 1e6)}`;
    const user = await createUser({ email: `shopper_${suffix}@test.com` });
    await createAddress(user.id);
    const { cart } = await seedCart(user.id, variant.id, opts.cartQty ?? 1);
    shoppers.push({ userId: user.id, cartId: cart.id });
  }
  return { warehouseId, variantId: variant.id, shoppers };
}

// ─── Cleanup additions (extends db.ts::cleanDatabase) ────────────────────────

/**
 * Deletes all rows that db.ts::cleanDatabase does NOT know about yet
 * (warehouse, inventory, reservation, wallet, refund, etc). Call AFTER
 * cleanDatabase in a beforeEach so we start clean for QA specs.
 *
 * Order matters — FKs are enforced.
 */
export async function cleanQATables(): Promise<void> {
  // Return items → return requests (FK chain)
  await prisma.returnItem.deleteMany();
  await prisma.returnRequest.deleteMany();
  // Loyalty transactions before users
  await prisma.loyaltyTransaction.deleteMany();
  // Tracking events before orders
  await prisma.trackingEvent.deleteMany();
  // Ledger entries (standalone)
  await prisma.ledgerEntry.deleteMany();
  // Payment reconciliation before orders
  await prisma.paymentReconciliation.deleteMany();
  // Reservations hold FKs to cart/variant/warehouse.
  await prisma.cartReservationItem.deleteMany();
  await prisma.cartReservation.deleteMany();
  // Wallet transactions depend on wallet + optional refund.
  await prisma.walletTransaction.deleteMany();
  await prisma.refundRequest.deleteMany();
  await prisma.wallet.deleteMany();
  // Abandoned cart
  await prisma.abandonedCart.deleteMany();
  // Referral credits before users
  await prisma.referralCredit.deleteMany();
  // Shipments before orders
  await prisma.shipmentItem.deleteMany();
  await prisma.shipment.deleteMany();
  // Fraud & risk
  await prisma.fraudFlag.deleteMany();
  await prisma.userRiskScore.deleteMany();
  await prisma.blacklist.deleteMany();
  // Flash sale products before flash sales
  await prisma.flashSaleProduct.deleteMany();
  await prisma.flashSale.deleteMany();
  // Inventory last (variants/products cleaned by cleanDatabase).
  await prisma.warehouseInventory.deleteMany();
  // New Phase-2+ models that FK-constrain User/Product/Order —
  // must be cleaned before cleanDatabase deletes the parent rows.
  await prisma.notification.deleteMany();
  await prisma.recentlyViewed.deleteMany();
  await prisma.exchangeRequest.deleteMany();
  await prisma.deliveryRating.deleteMany();
  await prisma.productQuestion.deleteMany();
  await prisma.priceAlert.deleteMany();
  await prisma.priceHistory.deleteMany();
  await prisma.volumeDiscount.deleteMany();
  await prisma.searchLog.deleteMany();
  await prisma.blogPost.deleteMany();
  // DO NOT delete the DEFAULT warehouse — reused across tests.
}

export { prisma };
