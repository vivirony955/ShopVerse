/**
 * Database Integration Tests
 * Tests Prisma model constraints, unique indexes, cascade deletes, and
 * business-critical data integrity rules directly against the database.
 * No HTTP — these talk to Prisma directly.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { cleanDatabase, createUser, createCategory, createBrand, createProduct, createVariant, createAddress, createCoupon } from './helpers/db';

const prisma = new PrismaClient();

beforeAll(async () => { await prisma.$connect(); });
afterAll(async () => { await prisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

// ─── User constraints ─────────────────────────────────────────────────────────

describe('Database — User model', () => {
  it('enforces unique email constraint', async () => {
    await createUser({ email: 'unique@test.com' });

    await expect(
      prisma.user.create({
        data: { email: 'unique@test.com', password: 'hashed' },
      }),
    ).rejects.toThrow();
  });

  it('defaults role to USER', async () => {
    const user = await prisma.user.create({
      data: { email: 'defaultrole@test.com', password: 'hashed' },
    });
    expect(user.role).toBe('USER');
  });

  it('cascades delete to addresses when user is deleted', async () => {
    const user = await createUser({ email: 'cascade-addr@test.com' });
    await createAddress(user.id);

    await prisma.user.delete({ where: { id: user.id } });

    const addresses = await prisma.address.findMany({ where: { userId: user.id } });
    expect(addresses).toHaveLength(0);
  });

  it('cascades delete to cart when user is deleted', async () => {
    const user = await createUser({ email: 'cascade-cart@test.com' });
    await prisma.cart.create({ data: { userId: user.id } });

    await prisma.user.delete({ where: { id: user.id } });

    const cart = await prisma.cart.findUnique({ where: { userId: user.id } });
    expect(cart).toBeNull();
  });

  it('cascades delete to wishlist entries when user is deleted', async () => {
    const user = await createUser({ email: 'cascade-wl@test.com' });
    const cat = await createCategory();
    const brand = await createBrand();
    const product = await createProduct(cat.id, brand.id);
    await prisma.wishlist.create({ data: { userId: user.id, productId: product.id } });

    await prisma.user.delete({ where: { id: user.id } });

    const wl = await prisma.wishlist.findMany({ where: { userId: user.id } });
    expect(wl).toHaveLength(0);
  });
});

// ─── Product constraints ──────────────────────────────────────────────────────

describe('Database — Product model', () => {
  it('enforces unique slug constraint', async () => {
    const cat = await createCategory();
    const brand = await createBrand();
    await createProduct(cat.id, brand.id, { slug: 'unique-slug' });

    await expect(
      prisma.product.create({
        data: {
          name: 'Duplicate',
          slug: 'unique-slug',
          description: 'desc',
          categoryId: cat.id,
          brandId: brand.id,
          basePrice: 100,
          images: [],
        },
      }),
    ).rejects.toThrow();
  });

  it('defaults isActive to true and discountPct to 0', async () => {
    const cat = await createCategory();
    const brand = await createBrand();
    const product = await prisma.product.create({
      data: {
        name: 'Defaults Product',
        slug: 'defaults-product',
        description: 'desc',
        categoryId: cat.id,
        brandId: brand.id,
        basePrice: 500,
        images: [],
      },
    });
    expect(product.isActive).toBe(true);
    expect(product.discountPct).toBe(0);
  });

  it('cascades delete to variants when product is deleted', async () => {
    const cat = await createCategory();
    const brand = await createBrand();
    const product = await createProduct(cat.id, brand.id);
    const variant = await createVariant(product.id);

    // Delete WI rows first (no ON CASCADE DELETE in schema) then product
    await prisma.warehouseInventory.deleteMany({ where: { variantId: variant.id } });
    await prisma.product.delete({ where: { id: product.id } });

    const found = await prisma.variant.findUnique({ where: { id: variant.id } });
    expect(found).toBeNull();
  });

  it('cascades delete to reviews when product is deleted', async () => {
    const cat = await createCategory();
    const brand = await createBrand();
    const product = await createProduct(cat.id, brand.id);
    const user = await createUser({ email: 'rev-cascade@test.com' });
    await prisma.review.create({ data: { userId: user.id, productId: product.id, rating: 4 } });

    await prisma.product.delete({ where: { id: product.id } });

    const reviews = await prisma.review.findMany({ where: { productId: product.id } });
    expect(reviews).toHaveLength(0);
  });

  it('cascades delete to wishlist entries when product is deleted', async () => {
    const cat = await createCategory();
    const brand = await createBrand();
    const product = await createProduct(cat.id, brand.id);
    const user = await createUser({ email: 'wl-prod-cascade@test.com' });
    await prisma.wishlist.create({ data: { userId: user.id, productId: product.id } });

    await prisma.product.delete({ where: { id: product.id } });

    const wl = await prisma.wishlist.findMany({ where: { productId: product.id } });
    expect(wl).toHaveLength(0);
  });
});

// ─── Variant constraints ──────────────────────────────────────────────────────

describe('Database — Variant model', () => {
  it('enforces unique SKU constraint', async () => {
    const cat = await createCategory();
    const brand = await createBrand();
    const product = await createProduct(cat.id, brand.id);
    await createVariant(product.id, { sku: 'DUP-SKU-001' });

    await expect(
      prisma.variant.create({
        data: { productId: product.id, size: 'L', color: 'Red', stock: 5, sku: 'DUP-SKU-001' },
      }),
    ).rejects.toThrow();
  });

  it('defaults stock to 0', async () => {
    const cat = await createCategory();
    const brand = await createBrand();
    const product = await createProduct(cat.id, brand.id);
    const variant = await prisma.variant.create({
      data: { productId: product.id, size: 'S', color: 'Blue', sku: `ZERO-${Date.now()}` },
    });
    expect(variant.stock).toBe(0);
  });
});

// ─── Cart constraints ─────────────────────────────────────────────────────────

describe('Database — Cart model', () => {
  it('enforces one cart per user (unique userId)', async () => {
    const user = await createUser({ email: 'one-cart@test.com' });
    await prisma.cart.create({ data: { userId: user.id } });

    await expect(
      prisma.cart.create({ data: { userId: user.id } }),
    ).rejects.toThrow();
  });

  it('enforces unique cartId+variantId in CartItem (no duplicate line items)', async () => {
    const user = await createUser({ email: 'dup-cartitem@test.com' });
    const cat = await createCategory();
    const brand = await createBrand();
    const product = await createProduct(cat.id, brand.id);
    const variant = await createVariant(product.id);
    const cart = await prisma.cart.create({ data: { userId: user.id } });

    await prisma.cartItem.create({ data: { cartId: cart.id, variantId: variant.id, quantity: 1 } });

    await expect(
      prisma.cartItem.create({ data: { cartId: cart.id, variantId: variant.id, quantity: 2 } }),
    ).rejects.toThrow();
  });

  it('cascades delete to cart items when cart is deleted', async () => {
    const user = await createUser({ email: 'cartitem-cascade@test.com' });
    const cat = await createCategory();
    const brand = await createBrand();
    const product = await createProduct(cat.id, brand.id);
    const variant = await createVariant(product.id);
    const cart = await prisma.cart.create({ data: { userId: user.id } });
    await prisma.cartItem.create({ data: { cartId: cart.id, variantId: variant.id, quantity: 1 } });

    await prisma.cart.delete({ where: { id: cart.id } });

    const items = await prisma.cartItem.findMany({ where: { cartId: cart.id } });
    expect(items).toHaveLength(0);
  });
});

// ─── Wishlist constraints ─────────────────────────────────────────────────────

describe('Database — Wishlist model', () => {
  it('enforces unique userId+productId in Wishlist', async () => {
    const user = await createUser({ email: 'dup-wl@test.com' });
    const cat = await createCategory();
    const brand = await createBrand();
    const product = await createProduct(cat.id, brand.id);

    await prisma.wishlist.create({ data: { userId: user.id, productId: product.id } });

    await expect(
      prisma.wishlist.create({ data: { userId: user.id, productId: product.id } }),
    ).rejects.toThrow();
  });
});

// ─── Review constraints ────────────────────────────────────────────────────────

describe('Database — Review model', () => {
  it('enforces unique userId+productId in Review (one review per user per product)', async () => {
    const user = await createUser({ email: 'dup-review@test.com' });
    const cat = await createCategory();
    const brand = await createBrand();
    const product = await createProduct(cat.id, brand.id);

    await prisma.review.create({ data: { userId: user.id, productId: product.id, rating: 4 } });

    await expect(
      prisma.review.create({ data: { userId: user.id, productId: product.id, rating: 5 } }),
    ).rejects.toThrow();
  });

  it('allows different users to review the same product', async () => {
    const u1 = await createUser({ email: 'rev-u1@test.com' });
    const u2 = await createUser({ email: 'rev-u2@test.com' });
    const cat = await createCategory();
    const brand = await createBrand();
    const product = await createProduct(cat.id, brand.id);

    await prisma.review.create({ data: { userId: u1.id, productId: product.id, rating: 4 } });
    await prisma.review.create({ data: { userId: u2.id, productId: product.id, rating: 5 } });

    const reviews = await prisma.review.findMany({ where: { productId: product.id } });
    expect(reviews).toHaveLength(2);
  });

  it('average rating aggregation is correct', async () => {
    const u1 = await createUser({ email: 'avg-rev1@test.com' });
    const u2 = await createUser({ email: 'avg-rev2@test.com' });
    const u3 = await createUser({ email: 'avg-rev3@test.com' });
    const cat = await createCategory();
    const brand = await createBrand();
    const product = await createProduct(cat.id, brand.id);

    await prisma.review.createMany({
      data: [
        { userId: u1.id, productId: product.id, rating: 5 },
        { userId: u2.id, productId: product.id, rating: 3 },
        { userId: u3.id, productId: product.id, rating: 1 },
      ],
    });

    const agg = await prisma.review.aggregate({
      where: { productId: product.id },
      _avg: { rating: true },
    });

    expect(agg._avg.rating).toBeCloseTo(3); // (5+3+1)/3
  });
});

// ─── Order constraints ────────────────────────────────────────────────────────

describe('Database — Order model', () => {
  it('defaults status to PENDING and paymentStatus to UNPAID', async () => {
    const user = await createUser({ email: 'order-defaults@test.com' });
    const cat = await createCategory();
    const brand = await createBrand();
    const product = await createProduct(cat.id, brand.id);
    const variant = await createVariant(product.id);

    const order = await prisma.order.create({
      data: {
        userId: user.id,
        addressSnapshot: { city: 'Mumbai' },
        subtotal: 1000,
        total: 1000,
        items: {
          create: [{ variantId: variant.id, quantity: 1, price: 1000 }],
        },
      },
    });

    expect(order.status).toBe('PENDING');
    expect(order.paymentStatus).toBe('UNPAID');
    expect(order.discountAmount).toBe(0);
  });

  it('cascades delete to order items when order is deleted', async () => {
    const user = await createUser({ email: 'orderitem-cascade@test.com' });
    const cat = await createCategory();
    const brand = await createBrand();
    const product = await createProduct(cat.id, brand.id);
    const variant = await createVariant(product.id);

    const order = await prisma.order.create({
      data: {
        userId: user.id,
        addressSnapshot: { city: 'Delhi' },
        subtotal: 500,
        total: 500,
        items: { create: [{ variantId: variant.id, quantity: 1, price: 500 }] },
      },
    });

    await prisma.order.delete({ where: { id: order.id } });

    const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    expect(items).toHaveLength(0);
  });

  it('addressSnapshot persists as JSON (immutable address data)', async () => {
    const user = await createUser({ email: 'snapshot-test@test.com' });

    const snapshot = {
      fullName: 'Test User',
      phone: '9999999999',
      line1: '123 Snapshot Lane',
      city: 'Kolkata',
      state: 'WB',
      pincode: '700001',
      isDefault: true,
    };

    const order = await prisma.order.create({
      data: {
        userId: user.id,
        addressSnapshot: snapshot,
        subtotal: 100,
        total: 100,
      },
    });

    const fetched = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fetched!.addressSnapshot).toMatchObject(snapshot);
  });
});

// ─── Coupon constraints ───────────────────────────────────────────────────────

describe('Database — Coupon model', () => {
  it('enforces unique coupon code', async () => {
    await createCoupon({ code: 'DUPCODE' });

    await expect(
      prisma.coupon.create({
        data: { code: 'DUPCODE', discountType: 'FIXED', discountValue: 50 },
      }),
    ).rejects.toThrow();
  });

  it('defaults isActive=true, usedCount=0, minOrderAmount=0', async () => {
    const coupon = await prisma.coupon.create({
      data: { code: 'DEFAULTS', discountType: 'PERCENTAGE', discountValue: 10 },
    });
    expect(coupon.isActive).toBe(true);
    expect(coupon.usedCount).toBe(0);
    expect(coupon.minOrderAmount).toBe(0);
    expect(coupon.maxUses).toBeNull();
    expect(coupon.expiresAt).toBeNull();
  });

  it('supports both PERCENTAGE and FIXED discount types', async () => {
    const pct = await prisma.coupon.create({
      data: { code: 'PCTTYPE', discountType: 'PERCENTAGE', discountValue: 15 },
    });
    const fixed = await prisma.coupon.create({
      data: { code: 'FIXTYPE', discountType: 'FIXED', discountValue: 100 },
    });

    expect(pct.discountType).toBe('PERCENTAGE');
    expect(fixed.discountType).toBe('FIXED');
  });
});

// ─── Category hierarchy ───────────────────────────────────────────────────────

describe('Database — Category hierarchy', () => {
  it('supports parent-child category hierarchy', async () => {
    const parent = await prisma.category.create({ data: { name: 'Apparel', slug: 'apparel' } });
    const child = await prisma.category.create({
      data: { name: 'Men Apparel', slug: 'men-apparel', parentId: parent.id },
    });

    const fetched = await prisma.category.findUnique({
      where: { id: child.id },
      include: { parent: true, children: true },
    });

    expect(fetched!.parent!.name).toBe('Apparel');
    expect(fetched!.parentId).toBe(parent.id);
  });

  it('parent has children relation populated', async () => {
    const parent = await prisma.category.create({ data: { name: 'Electronics', slug: 'electronics' } });
    await prisma.category.create({ data: { name: 'Phones', slug: 'phones', parentId: parent.id } });
    await prisma.category.create({ data: { name: 'Laptops', slug: 'laptops', parentId: parent.id } });

    const fetched = await prisma.category.findUnique({
      where: { id: parent.id },
      include: { children: true },
    });

    expect(fetched!.children).toHaveLength(2);
  });

  it('enforces unique category slug', async () => {
    await prisma.category.create({ data: { name: 'Uniq Cat', slug: 'uniq-cat' } });

    await expect(
      prisma.category.create({ data: { name: 'Another', slug: 'uniq-cat' } }),
    ).rejects.toThrow();
  });
});

// ─── Stock operations ─────────────────────────────────────────────────────────

describe('Database — Stock management', () => {
  it('stock can be decremented atomically via Prisma update', async () => {
    const cat = await createCategory();
    const brand = await createBrand();
    const product = await createProduct(cat.id, brand.id);
    const variant = await createVariant(product.id, { stock: 10 });

    await prisma.variant.update({
      where: { id: variant.id },
      data: { stock: { decrement: 3 } },
    });

    const updated = await prisma.variant.findUnique({ where: { id: variant.id } });
    expect(updated!.stock).toBe(7);
  });

  it('stock can be restored atomically via Prisma update (order cancel)', async () => {
    const cat = await createCategory();
    const brand = await createBrand();
    const product = await createProduct(cat.id, brand.id);
    const variant = await createVariant(product.id, { stock: 7 });

    await prisma.variant.update({
      where: { id: variant.id },
      data: { stock: { increment: 3 } },
    });

    const updated = await prisma.variant.findUnique({ where: { id: variant.id } });
    expect(updated!.stock).toBe(10);
  });

  it('coupon usedCount can be incremented atomically', async () => {
    const coupon = await createCoupon({ code: 'INCR-TEST', maxUses: 5 });

    await prisma.coupon.update({
      where: { id: coupon.id },
      data: { usedCount: { increment: 1 } },
    });

    const updated = await prisma.coupon.findUnique({ where: { id: coupon.id } });
    expect(updated!.usedCount).toBe(1);
  });
});

// ─── Transaction behaviour ────────────────────────────────────────────────────

describe('Database — Transaction atomicity', () => {
  it('rolls back all operations when a transaction fails mid-way', async () => {
    const user = await createUser({ email: 'txn-rollback@test.com' });
    const cat = await createCategory();
    const brand = await createBrand();
    const product = await createProduct(cat.id, brand.id);
    const variant = await createVariant(product.id, { stock: 10 });

    const initialStock = variant.stock;

    await expect(
      prisma.$transaction(async (tx) => {
        // Decrement stock
        await tx.variant.update({
          where: { id: variant.id },
          data: { stock: { decrement: 3 } },
        });

        // Simulate a failure mid-transaction
        throw new Error('Simulated transaction failure');
      }),
    ).rejects.toThrow('Simulated transaction failure');

    // Stock should be unchanged after rollback
    const afterRollback = await prisma.variant.findUnique({ where: { id: variant.id } });
    expect(afterRollback!.stock).toBe(initialStock);
  });

  it('commits all operations when transaction succeeds', async () => {
    const user = await createUser({ email: 'txn-commit@test.com' });
    const cat = await createCategory();
    const brand = await createBrand();
    const product = await createProduct(cat.id, brand.id);
    const variant = await createVariant(product.id, { stock: 10 });
    const coupon = await createCoupon({ code: 'TXN-COUP', usedCount: 0 } as any);

    await prisma.$transaction(async (tx) => {
      await tx.variant.update({
        where: { id: variant.id },
        data: { stock: { decrement: 2 } },
      });
      await tx.coupon.update({
        where: { id: coupon.id },
        data: { usedCount: { increment: 1 } },
      });
    });

    const updatedVariant = await prisma.variant.findUnique({ where: { id: variant.id } });
    const updatedCoupon = await prisma.coupon.findUnique({ where: { id: coupon.id } });

    expect(updatedVariant!.stock).toBe(8);
    expect(updatedCoupon!.usedCount).toBe(1);
  });
});
