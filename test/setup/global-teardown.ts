// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * Runs once after all test suites complete.
 * Cleans up the test database to leave it in a pristine state.
 */
import { PrismaClient } from '@prisma/client';

export default async function globalTeardown() {
  // Use the shared test Prisma client if available (globalThis singleton from
  // helpers/db.ts); fall back to a fresh client if tests didn't run at all.
  const prisma: PrismaClient = (global as any).__testPrisma ?? new PrismaClient();
  try {
    // D-04: Delete Invoice + RefundApproval before Order (FK) using raw SQL
    // so this works even before the Prisma client is regenerated with the new models.
    await prisma.$executeRaw`DELETE FROM "Invoice"`.catch(() => {});
    await prisma.$executeRaw`DELETE FROM "RefundApproval"`.catch(() => {});

    // Schema drift models with RESTRICT FKs must be deleted outside the
    // main transaction so we can use .catch() per-table safely.
    await prisma.blogPost.deleteMany().catch(() => {});
    await prisma.productQuestion.deleteMany().catch(() => {});
    await prisma.notification.deleteMany().catch(() => {});
    await prisma.recentlyViewed.deleteMany().catch(() => {});
    await prisma.priceAlert.deleteMany().catch(() => {});
    await prisma.searchLog.deleteMany().catch(() => {});
    await prisma.securityAlert.deleteMany().catch(() => {});
    await prisma.loyaltyTier.deleteMany().catch(() => {});
    await prisma.sizeChart.deleteMany().catch(() => {});

    await prisma.$transaction([
      // QA tables (FK children first)
      prisma.returnItem.deleteMany(),
      prisma.returnRequest.deleteMany(),
      prisma.loyaltyTransaction.deleteMany(),
      prisma.trackingEvent.deleteMany(),
      prisma.ledgerEntry.deleteMany(),
      prisma.paymentReconciliation.deleteMany(),
      prisma.cartReservationItem.deleteMany(),
      prisma.cartReservation.deleteMany(),
      prisma.walletTransaction.deleteMany(),
      prisma.refundRequest.deleteMany(),
      prisma.wallet.deleteMany(),
      prisma.abandonedCart.deleteMany(),
      prisma.referralCredit.deleteMany(),
      prisma.warehouseInventory.deleteMany(),
      // Shipments
      prisma.shipmentItem.deleteMany(),
      prisma.shipment.deleteMany(),
      // Fraud & flash
      prisma.fraudFlag.deleteMany(),
      prisma.userRiskScore.deleteMany(),
      prisma.blacklist.deleteMany(),
      prisma.flashSaleProduct.deleteMany(),
      prisma.flashSale.deleteMany(),
      // Original tables
      prisma.review.deleteMany(),
      prisma.wishlist.deleteMany(),
      prisma.orderItem.deleteMany(),
      prisma.order.deleteMany(),
      prisma.cartItem.deleteMany(),
      prisma.cart.deleteMany(),
      prisma.variant.deleteMany(),
      prisma.product.deleteMany(),
      prisma.address.deleteMany(),
      prisma.coupon.deleteMany(),
      prisma.user.deleteMany(),
      prisma.brand.deleteMany(),
      prisma.category.deleteMany(),
    ]);
  } finally {
    await prisma.$disconnect();
  }
}
