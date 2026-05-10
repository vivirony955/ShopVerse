/**
 * Frontend API Client Integration Tests
 * Tests the axios-based API client (frontend/src/lib/api.ts) against a live backend.
 *
 * Strategy: boot the NestJS app, seed test data, then invoke the API client functions
 * directly (bypassing NextAuth session injection by pre-configuring http.defaults.headers).
 * This validates that URLs, HTTP methods, and payload shapes are all correct.
 */
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import {
  cleanDatabase,
  createUser,
  createAdminUser,
  createCategory,
  createBrand,
  createProduct,
  createVariant,
  createAddress,
  createCoupon,
  seedCart,
  prisma,
} from './helpers/db';
import { loginAs } from './helpers/auth';

// We import the frontend API client directly.
// Silence the NextAuth getSession import (it runs in Node, not browser).
jest.mock('next-auth/react', () => ({
  getSession: jest.fn().mockResolvedValue(null),
}));

// Import client AFTER mocking next-auth/react
import {
  http,
  authApi,
  usersApi,
  categoriesApi,
  brandsApi,
  productsApi,
  cartApi,
  wishlistApi,
  couponsApi,
  ordersApi,
  reviewsApi,
} from '../frontend/src/lib/api';

/** Override the axios baseURL to point at the test server's ephemeral port. */
function setBaseUrl(port: number) {
  http.defaults.baseURL = `http://localhost:${port}/api`;
}

/** Set an Authorization header on the shared axios instance. */
function setToken(token: string) {
  http.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}

function clearToken() {
  delete http.defaults.headers.common['Authorization'];
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Frontend API Client — Integration', () => {
  let app: INestApplication;
  let port: number;

  beforeAll(async () => {
    app = await getTestApp();
    const server = app.getHttpServer();
    // Assign a random port so we can locate the server
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
    port = server.address()?.port ?? 4001;
    setBaseUrl(port);
  });

  afterAll(async () => {
    clearToken();
    await closeTestApp();
  });

  beforeEach(async () => {
    clearToken();
    await cleanDatabase();
  });

  // ─── authApi ──────────────────────────────────────────────────────────────

  describe('authApi', () => {
    it('authApi.register() creates a new user', async () => {
      const result = await authApi.register({
        email: 'frontend-reg@test.com',
        password: 'Password1!',
        firstName: 'Front',
        lastName: 'End',
      });

      expect(result.email).toBe('frontend-reg@test.com');
      expect(result.firstName).toBe('Front');
      expect(result.password).toBeUndefined();
    });

    it('authApi.register() throws on duplicate email', async () => {
      await authApi.register({ email: 'dup-reg@test.com', password: 'Password1!' });
      await expect(
        authApi.register({ email: 'dup-reg@test.com', password: 'Password1!' }),
      ).rejects.toMatchObject({ response: { status: 409 } });
    });
  });

  // ─── usersApi ─────────────────────────────────────────────────────────────

  describe('usersApi', () => {
    it('usersApi.me() returns current user profile', async () => {
      await createUser({ email: 'apiuser@test.com', password: 'Password1!', firstName: 'Api' });
      const { access_token } = await loginAs(app, 'apiuser@test.com', 'Password1!');
      setToken(access_token);

      const result = await usersApi.me();
      expect(result.email).toBe('apiuser@test.com');
      expect(result.firstName).toBe('Api');
    });

    it('usersApi.updateProfile() updates profile fields', async () => {
      await createUser({ email: 'apiupd@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'apiupd@test.com', 'Password1!');
      setToken(access_token);

      const result = await usersApi.updateProfile({ firstName: 'Updated', phone: '9876543210' });
      expect(result.firstName).toBe('Updated');
      expect(result.phone).toBe('9876543210');
    });

    it('usersApi.getAddresses() returns address list', async () => {
      const user = await createUser({ email: 'apiaddr@test.com', password: 'Password1!' });
      await createAddress(user.id);
      const { access_token } = await loginAs(app, 'apiaddr@test.com', 'Password1!');
      setToken(access_token);

      const result = await usersApi.getAddresses();
      expect(result).toHaveLength(1);
      expect(result[0].city).toBe('Mumbai');
    });

    it('usersApi.addAddress() creates an address', async () => {
      await createUser({ email: 'apiaddrAdd@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'apiaddrAdd@test.com', 'Password1!');
      setToken(access_token);

      const result = await usersApi.addAddress({
        fullName: 'API User',
        phone: '9999999999',
        line1: '1 API Lane',
        city: 'Chennai',
        state: 'TN',
        pincode: '600001',
        isDefault: false,
      });
      expect(result.city).toBe('Chennai');
    });

    it('usersApi.deleteAddress() deletes an address', async () => {
      const user = await createUser({ email: 'apideladdr@test.com', password: 'Password1!' });
      const addr = await createAddress(user.id);
      const { access_token } = await loginAs(app, 'apideladdr@test.com', 'Password1!');
      setToken(access_token);

      await expect(usersApi.deleteAddress(addr.id)).resolves.toBeDefined();
      const remaining = await usersApi.getAddresses();
      expect(remaining).toHaveLength(0);
    });

    it('usersApi.setDefaultAddress() sets default', async () => {
      const user = await createUser({ email: 'apidefault@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'apidefault@test.com', 'Password1!');
      setToken(access_token);

      const a1 = await usersApi.addAddress({ fullName: 'A1', phone: '1111111111', line1: 'L1', city: 'C1', state: 'S1', pincode: '111111', isDefault: false });
      const a2 = await usersApi.addAddress({ fullName: 'A2', phone: '2222222222', line1: 'L2', city: 'C2', state: 'S2', pincode: '222222', isDefault: false });

      const result = await usersApi.setDefaultAddress(a2.id);
      expect(result.isDefault).toBe(true);
    });
  });

  // ─── categoriesApi ────────────────────────────────────────────────────────

  describe('categoriesApi', () => {
    it('categoriesApi.getAll() returns all categories', async () => {
      await createCategory({ name: 'Men', slug: 'men-fe' });
      await createCategory({ name: 'Women', slug: 'women-fe' });

      const result = await categoriesApi.getAll();
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('categoriesApi.getOne() returns a single category', async () => {
      const cat = await createCategory({ name: 'Kids', slug: 'kids-fe' });

      const result = await categoriesApi.getOne(cat.id);
      expect(result.name).toBe('Kids');
    });

    it('categoriesApi.getOne() throws 404 for unknown id', async () => {
      await expect(categoriesApi.getOne(99999)).rejects.toMatchObject({
        response: { status: 404 },
      });
    });
  });

  // ─── brandsApi ────────────────────────────────────────────────────────────

  describe('brandsApi', () => {
    it('brandsApi.getAll() returns all brands', async () => {
      await createBrand({ name: 'Nike-FE', slug: 'nike-fe' });

      const result = await brandsApi.getAll();
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── productsApi ──────────────────────────────────────────────────────────

  describe('productsApi', () => {
    it('productsApi.getAll() returns paginated products', async () => {
      const cat = await createCategory({ slug: 'fe-cat' });
      const brand = await createBrand({ slug: 'fe-brand' });
      await createProduct(cat.id, brand.id, { slug: 'fe-prod-1' });
      await createProduct(cat.id, brand.id, { slug: 'fe-prod-2' });

      const result = await productsApi.getAll();
      expect(result.total).toBeGreaterThanOrEqual(2);
      expect(result.items).toBeDefined();
      expect(result.page).toBe(1);
    });

    it('productsApi.getAll() applies filters correctly', async () => {
      const cat = await createCategory({ name: 'FilterCat', slug: 'filter-cat-fe' });
      const brand = await createBrand({ slug: 'filter-brand-fe' });
      await createProduct(cat.id, brand.id, { slug: 'fe-filter-1', basePrice: 100 });
      await createProduct(cat.id, brand.id, { slug: 'fe-filter-2', basePrice: 900 });

      const result = await productsApi.getAll({ minPrice: 500 });
      expect(result.items.every((p: any) => p.basePrice >= 500)).toBe(true);
    });

    it('productsApi.getAll() filters out empty string params', async () => {
      // Should not crash when passed empty string filters
      const result = await productsApi.getAll({ search: '', category: '' });
      expect(result).toBeDefined();
    });

    it('productsApi.getOne() returns product with variants', async () => {
      const cat = await createCategory({ slug: 'fe-detail-cat' });
      const brand = await createBrand({ slug: 'fe-detail-brand' });
      const product = await createProduct(cat.id, brand.id, { slug: 'fe-detail-prod' });
      await createVariant(product.id, { size: 'L', stock: 5 });

      const result = await productsApi.getOne(product.id);
      expect(result.name).toBeDefined();
      expect(result.variants).toHaveLength(1);
    });

    it('productsApi.getOne() throws 404 for unknown id', async () => {
      await expect(productsApi.getOne(99999)).rejects.toMatchObject({
        response: { status: 404 },
      });
    });
  });

  // ─── cartApi ──────────────────────────────────────────────────────────────

  describe('cartApi', () => {
    it('cartApi.get() returns empty cart for new user', async () => {
      await createUser({ email: 'fe-cart@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'fe-cart@test.com', 'Password1!');
      setToken(access_token);

      const result = await cartApi.get();
      expect(result.items).toEqual([]);
    });

    it('cartApi.addItem() adds an item', async () => {
      const cat = await createCategory({ slug: 'fe-cart-cat' });
      const brand = await createBrand({ slug: 'fe-cart-brand' });
      const product = await createProduct(cat.id, brand.id, { slug: 'fe-cart-prod' });
      const variant = await createVariant(product.id, { stock: 10 });

      await createUser({ email: 'fe-cartadd@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'fe-cartadd@test.com', 'Password1!');
      setToken(access_token);

      const result = await cartApi.addItem(variant.id, 2);
      expect(result.quantity).toBe(2);
    });

    it('cartApi.updateItem() changes quantity', async () => {
      const cat = await createCategory({ slug: 'fe-cartupd-cat' });
      const brand = await createBrand({ slug: 'fe-cartupd-brand' });
      const product = await createProduct(cat.id, brand.id, { slug: 'fe-cartupd-prod' });
      const variant = await createVariant(product.id, { stock: 10 });

      await createUser({ email: 'fe-cartupd@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'fe-cartupd@test.com', 'Password1!');
      setToken(access_token);

      const added = await cartApi.addItem(variant.id, 1);
      const updated = await cartApi.updateItem(added.id, 4);
      expect(updated.quantity).toBe(4);
    });

    it('cartApi.removeItem() removes an item', async () => {
      const cat = await createCategory({ slug: 'fe-cartrm-cat' });
      const brand = await createBrand({ slug: 'fe-cartrm-brand' });
      const product = await createProduct(cat.id, brand.id, { slug: 'fe-cartrm-prod' });
      const variant = await createVariant(product.id, { stock: 10 });

      await createUser({ email: 'fe-cartrm@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'fe-cartrm@test.com', 'Password1!');
      setToken(access_token);

      const added = await cartApi.addItem(variant.id, 1);
      await cartApi.removeItem(added.id);

      const cart = await cartApi.get();
      expect(cart.items).toHaveLength(0);
    });

    it('cartApi.clear() clears all items', async () => {
      const cat = await createCategory({ slug: 'fe-cartclr-cat' });
      const brand = await createBrand({ slug: 'fe-cartclr-brand' });
      const product = await createProduct(cat.id, brand.id, { slug: 'fe-cartclr-prod' });
      const v1 = await createVariant(product.id, { size: 'S', stock: 5, sku: `FE-S-${Date.now()}` });
      const v2 = await createVariant(product.id, { size: 'L', stock: 5, sku: `FE-L-${Date.now()}` });

      await createUser({ email: 'fe-cartclr@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'fe-cartclr@test.com', 'Password1!');
      setToken(access_token);

      await cartApi.addItem(v1.id, 1);
      await cartApi.addItem(v2.id, 1);
      await cartApi.clear();

      const cart = await cartApi.get();
      expect(cart.items).toHaveLength(0);
    });
  });

  // ─── wishlistApi ──────────────────────────────────────────────────────────

  describe('wishlistApi', () => {
    it('wishlistApi.get() returns empty wishlist', async () => {
      await createUser({ email: 'fe-wl@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'fe-wl@test.com', 'Password1!');
      setToken(access_token);

      const result = await wishlistApi.get();
      expect(result).toEqual([]);
    });

    it('wishlistApi.add() and wishlistApi.remove() round-trip', async () => {
      const cat = await createCategory({ slug: 'fe-wl-cat' });
      const brand = await createBrand({ slug: 'fe-wl-brand' });
      const product = await createProduct(cat.id, brand.id, { slug: 'fe-wl-prod' });

      await createUser({ email: 'fe-wlrt@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'fe-wlrt@test.com', 'Password1!');
      setToken(access_token);

      await wishlistApi.add(product.id);
      const after = await wishlistApi.get();
      expect(after).toHaveLength(1);

      await wishlistApi.remove(product.id);
      const cleared = await wishlistApi.get();
      expect(cleared).toHaveLength(0);
    });
  });

  // ─── couponsApi ───────────────────────────────────────────────────────────

  describe('couponsApi', () => {
    it('couponsApi.validate() returns discount info for valid coupon', async () => {
      await createCoupon({ code: 'FETEST20', discountType: 'PERCENTAGE', discountValue: 20 });

      const result = await couponsApi.validate('FETEST20', 1000);
      expect(result.valid).toBe(true);
      expect(result.discount).toBeCloseTo(200);
    });

    it('couponsApi.validate() throws 404 for unknown coupon', async () => {
      await expect(couponsApi.validate('UNKNOWN', 1000)).rejects.toMatchObject({
        response: { status: 404 },
      });
    });
  });

  // ─── ordersApi ────────────────────────────────────────────────────────────

  describe('ordersApi', () => {
    it('ordersApi.place() places an order and ordersApi.getAll() returns it', async () => {
      const cat = await createCategory({ slug: 'fe-ord-cat' });
      const brand = await createBrand({ slug: 'fe-ord-brand' });
      const product = await createProduct(cat.id, brand.id, { slug: 'fe-ord-prod', basePrice: 500 });
      const variant = await createVariant(product.id, { stock: 10 });

      const user = await createUser({ email: 'fe-order@test.com', password: 'Password1!' });
      const address = await createAddress(user.id);
      await seedCart(user.id, variant.id, 1);

      const { access_token } = await loginAs(app, 'fe-order@test.com', 'Password1!');
      setToken(access_token);

      const { reservationId } = await cartApi.reserve();
      const order = await ordersApi.place({ addressId: address.id, reservationId });
      expect(order.id).toBeDefined();
      expect(order.status).toBe('PENDING');

      const all = await ordersApi.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(order.id);
    });

    it('ordersApi.getOne() returns order by id', async () => {
      const cat = await createCategory({ slug: 'fe-ord2-cat' });
      const brand = await createBrand({ slug: 'fe-ord2-brand' });
      const product = await createProduct(cat.id, brand.id, { slug: 'fe-ord2-prod', basePrice: 300 });
      const variant = await createVariant(product.id, { stock: 10 });

      const user = await createUser({ email: 'fe-order2@test.com', password: 'Password1!' });
      const address = await createAddress(user.id);
      await seedCart(user.id, variant.id, 1);

      const { access_token } = await loginAs(app, 'fe-order2@test.com', 'Password1!');
      setToken(access_token);

      const { reservationId } = await cartApi.reserve();
      const placed = await ordersApi.place({ addressId: address.id, reservationId });
      const fetched = await ordersApi.getOne(placed.id);

      expect(fetched.id).toBe(placed.id);
      expect(fetched.items).toBeDefined();
    });

    it('ordersApi.cancel() cancels a pending order', async () => {
      const cat = await createCategory({ slug: 'fe-ord3-cat' });
      const brand = await createBrand({ slug: 'fe-ord3-brand' });
      const product = await createProduct(cat.id, brand.id, { slug: 'fe-ord3-prod', basePrice: 400 });
      const variant = await createVariant(product.id, { stock: 10 });

      const user = await createUser({ email: 'fe-cancel@test.com', password: 'Password1!' });
      const address = await createAddress(user.id);
      await seedCart(user.id, variant.id, 1);

      const { access_token } = await loginAs(app, 'fe-cancel@test.com', 'Password1!');
      setToken(access_token);

      const { reservationId } = await cartApi.reserve();
      const placed = await ordersApi.place({ addressId: address.id, reservationId });
      const result = await ordersApi.cancel(placed.id);
      expect(result.message).toContain('cancelled');
    });
  });

  // ─── reviewsApi ───────────────────────────────────────────────────────────

  describe('reviewsApi', () => {
    it('reviewsApi.getForProduct() returns paginated reviews', async () => {
      const cat = await createCategory({ slug: 'fe-rev-cat' });
      const brand = await createBrand({ slug: 'fe-rev-brand' });
      const product = await createProduct(cat.id, brand.id, { slug: 'fe-rev-prod' });

      const result = await reviewsApi.getForProduct(product.id);
      expect(result.reviews).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.avgRating).toBe(0);
    });

    it('reviewsApi.create() creates, reviewsApi.update() updates, reviewsApi.delete() deletes', async () => {
      const cat = await createCategory({ slug: 'fe-rev2-cat' });
      const brand = await createBrand({ slug: 'fe-rev2-brand' });
      const product = await createProduct(cat.id, brand.id, { slug: 'fe-rev2-prod' });

      await createUser({ email: 'fe-rev@test.com', password: 'Password1!' });
      const { access_token } = await loginAs(app, 'fe-rev@test.com', 'Password1!');
      setToken(access_token);

      // Create
      const created = await reviewsApi.create(product.id, { rating: 4, title: 'Nice' });
      expect(created.rating).toBe(4);

      // Update
      const updated = await reviewsApi.update(created.id, { rating: 5, title: 'Great!' });
      expect(updated.rating).toBe(5);

      // Delete
      await reviewsApi.delete(created.id);

      const list = await reviewsApi.getForProduct(product.id);
      expect(list.total).toBe(0);
    });
  });
});
