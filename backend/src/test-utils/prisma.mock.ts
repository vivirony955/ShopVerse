// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * Creates a fully-typed Jest mock of every Prisma model delegate used across the app.
 * Import this factory in any service spec: const prisma = createPrismaMock();
 */

type MockDelegate = {
  findMany: jest.Mock;
  findUnique: jest.Mock;
  findFirst: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
  count: jest.Mock;
  aggregate: jest.Mock;
  upsert: jest.Mock;
};

const delegate = (): MockDelegate => ({
  findMany: jest.fn(),
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  delete: jest.fn(),
  deleteMany: jest.fn(),
  count: jest.fn(),
  aggregate: jest.fn(),
  upsert: jest.fn(),
});

export type MockPrisma = {
  user: MockDelegate;
  address: MockDelegate;
  category: MockDelegate;
  brand: MockDelegate;
  product: MockDelegate;
  variant: MockDelegate;
  cart: MockDelegate;
  cartItem: MockDelegate;
  wishlist: MockDelegate;
  order: MockDelegate;
  orderItem: MockDelegate;
  review: MockDelegate;
  coupon: MockDelegate;
  couponUsage: MockDelegate;
  trackingEvent: MockDelegate;
  returnRequest: MockDelegate;
  returnItem: MockDelegate;
  refundRequest: MockDelegate;
  invoice: MockDelegate;
  productFaq: MockDelegate;
  pincodeServiceability: MockDelegate;
  flashSale: MockDelegate;
  flashSaleProduct: MockDelegate;
  loyaltyTransaction: MockDelegate;
  abandonedCart: MockDelegate;
  referralCredit: MockDelegate;
  warehouse: MockDelegate;
  warehouseInventory: MockDelegate;
  shipment: MockDelegate;
  shipmentItem: MockDelegate;
  cartReservation: MockDelegate;
  preOrder: MockDelegate;
  wallet: MockDelegate;
  walletTransaction: MockDelegate;
  ledgerEntry: MockDelegate;
  paymentReconciliation: MockDelegate;
  userRiskScore: MockDelegate;
  blacklist: MockDelegate;
  fraudFlag: MockDelegate;
  supportTicket: MockDelegate;
  ticketNote: MockDelegate;
  adminNote: MockDelegate;
  webhookEndpoint: MockDelegate;
  webhookDelivery: MockDelegate;
  affiliateAccount: MockDelegate;
  campaignAttribution: MockDelegate;
  policyDocument: MockDelegate;
  cookieConsent: MockDelegate;
  savedForLater: MockDelegate;
  deliverySlot: MockDelegate;
  giftOption: MockDelegate;
  $transaction: jest.Mock;
  $executeRaw: jest.Mock;
  $executeRawUnsafe: jest.Mock;
  $queryRaw: jest.Mock;
  $queryRawUnsafe: jest.Mock;
  $connect: jest.Mock;
  $disconnect: jest.Mock;
};

export const createPrismaMock = (): MockPrisma => {
  const mock: MockPrisma = {
    user: delegate(),
    address: delegate(),
    category: delegate(),
    brand: delegate(),
    product: delegate(),
    variant: delegate(),
    cart: delegate(),
    cartItem: delegate(),
    wishlist: delegate(),
    order: delegate(),
    orderItem: delegate(),
    review: delegate(),
    coupon: delegate(),
    couponUsage: delegate(),
    trackingEvent: delegate(),
    returnRequest: delegate(),
    returnItem: delegate(),
    refundRequest: delegate(),
    invoice: delegate(),
    productFaq: delegate(),
    pincodeServiceability: delegate(),
    flashSale: delegate(),
    flashSaleProduct: delegate(),
    loyaltyTransaction: delegate(),
    abandonedCart: delegate(),
    referralCredit: delegate(),
    // ─── Advanced modules ─────────────────────────────────────────────────────
    warehouse: delegate(),
    warehouseInventory: delegate(),
    shipment: delegate(),
    shipmentItem: delegate(),
    cartReservation: delegate(),
    preOrder: delegate(),
    wallet: delegate(),
    walletTransaction: delegate(),
    ledgerEntry: delegate(),
    paymentReconciliation: delegate(),
    userRiskScore: delegate(),
    blacklist: delegate(),
    fraudFlag: delegate(),
    supportTicket: delegate(),
    ticketNote: delegate(),
    adminNote: delegate(),
    webhookEndpoint: delegate(),
    webhookDelivery: delegate(),
    affiliateAccount: delegate(),
    campaignAttribution: delegate(),
    policyDocument: delegate(),
    cookieConsent: delegate(),
    savedForLater: delegate(),
    deliverySlot: delegate(),
    giftOption: delegate(),
    /** Runs the callback immediately with the same mock so transactions are transparent */
    $transaction: jest.fn((cb: unknown) =>
      typeof cb === 'function'
        ? (cb as (tx: MockPrisma) => unknown)(mock)
        : Promise.resolve(cb),
    ),
    /** Raw SQL — mock as jest.fn; works with both tagged template and regular call */
    $executeRaw: jest.fn().mockResolvedValue(1),
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([]),
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };
  return mock;
};
