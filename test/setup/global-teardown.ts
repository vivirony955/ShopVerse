/**
 * Runs once after all test suites complete.
 * Cleans up the test database to leave it in a pristine state.
 */
import { PrismaClient } from '@prisma/client';

export default async function globalTeardown() {
  const prisma = new PrismaClient();
  try {
    // D-04: Delete Invoice + RefundApproval before Order (FK) using raw SQL
    // so this works even before the Prisma client is regenerated with the new models.
    await prisma.$executeRaw`DELETE FROM "Invoice"`.catch(() => {});
    await prisma.$executeRaw`DELETE FROM "RefundApproval"`.catch(() => {});

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
