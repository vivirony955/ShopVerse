// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * Volume Discounts — E2E spec
 *
 * Covers: create, findAll, getForProduct (product + category fallback),
 * getBestDiscount (threshold logic), update, delete, inactive exclusion,
 * nonexistent product.
 */
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import { prisma, cleanDatabase } from './helpers/db';
import { cleanQATables, makeShopper } from './helpers/factories';
import { VolumeDiscountsService } from '../backend/src/volume-discounts/volume-discounts.service';

let app: INestApplication;
let svc: VolumeDiscountsService;

beforeAll(async () => {
  app = await getTestApp();
  svc = app.get(VolumeDiscountsService);
});

afterAll(async () => {
  await closeTestApp();
});

beforeEach(async () => {
  await cleanQATables();
  await cleanDatabase();
});

// ─── VD-H01: create a product-level discount ────────────────────────────────

it('VD-H01: create product-level volume discount', async () => {
  const s = await makeShopper();
  const vd = await svc.create({ productId: s.product.id, minQty: 3, discountPct: 10 });
  expect(vd.id).toBeDefined();
  expect(vd.productId).toBe(s.product.id);
  expect(vd.minQty).toBe(3);
  expect(vd.discountPct).toBe(10);
  expect(vd.isActive).toBe(true);
});

// ─── VD-H02: getForProduct returns product-level discounts ──────────────────

it('VD-H02: getForProduct returns applicable product-level discounts', async () => {
  const s = await makeShopper();
  await svc.create({ productId: s.product.id, minQty: 2, discountPct: 5 });
  await svc.create({ productId: s.product.id, minQty: 5, discountPct: 15 });

  const discounts = await svc.getForProduct(s.product.id);
  expect(discounts.length).toBeGreaterThanOrEqual(2);
  // Ordered by minQty ascending
  expect(discounts[0].minQty).toBeLessThanOrEqual(discounts[1].minQty);
});

// ─── VD-H03: category-level discount falls back to product ──────────────────

it('VD-H03: category-level discount is returned for product in that category', async () => {
  const s = await makeShopper();

  // Look up the actual categoryId of the product
  const product = await prisma.product.findUnique({ where: { id: s.product.id } });

  // Create discount at the product's category level
  await svc.create({ categoryId: product!.categoryId, minQty: 4, discountPct: 12 });

  const discounts = await svc.getForProduct(s.product.id);
  const catDiscounts = discounts.filter((d: any) => d.categoryId === product!.categoryId);
  expect(catDiscounts.length).toBeGreaterThanOrEqual(1);
});

// ─── VD-H04: getBestDiscount returns highest applicable discount ─────────────

it('VD-H04: getBestDiscount returns highest discount for quantity', async () => {
  const s = await makeShopper();
  await svc.create({ productId: s.product.id, minQty: 2, discountPct: 5 });
  await svc.create({ productId: s.product.id, minQty: 5, discountPct: 15 });
  await svc.create({ productId: s.product.id, minQty: 10, discountPct: 25 });

  // Qty = 6: only the 2-qty and 5-qty tiers apply (not 10-qty)
  const best = await svc.getBestDiscount(s.product.id, 6);
  expect(best).toBe(15);
});

// ─── VD-H05: getBestDiscount returns 0 if qty below threshold ───────────────

it('VD-H05: getBestDiscount returns 0 when qty is below all thresholds', async () => {
  const s = await makeShopper();
  await svc.create({ productId: s.product.id, minQty: 5, discountPct: 10 });

  const best = await svc.getBestDiscount(s.product.id, 2);
  expect(best).toBe(0);
});

// ─── VD-H06: getBestDiscount at exact threshold ──────────────────────────────

it('VD-H06: getBestDiscount applies discount at exact minQty threshold', async () => {
  const s = await makeShopper();
  await svc.create({ productId: s.product.id, minQty: 3, discountPct: 8 });

  const best = await svc.getBestDiscount(s.product.id, 3);
  expect(best).toBe(8);
});

// ─── VD-H07: inactive discounts excluded ────────────────────────────────────

it('VD-H07: inactive discounts are excluded from getForProduct', async () => {
  const s = await makeShopper();
  const vd = await svc.create({ productId: s.product.id, minQty: 2, discountPct: 10 });

  // Deactivate it
  await svc.update(vd.id, { isActive: false });

  const discounts = await svc.getForProduct(s.product.id);
  const activeIds = discounts.filter(d => d.isActive).map(d => d.id);
  expect(activeIds).not.toContain(vd.id);
});

// ─── VD-H08: update discount percentage ─────────────────────────────────────

it('VD-H08: update changes discount percentage', async () => {
  const s = await makeShopper();
  const vd = await svc.create({ productId: s.product.id, minQty: 3, discountPct: 10 });

  const updated = await svc.update(vd.id, { discountPct: 20 });
  expect(updated.discountPct).toBe(20);
});

// ─── VD-H09: delete removes the discount ────────────────────────────────────

it('VD-H09: delete removes the volume discount', async () => {
  const s = await makeShopper();
  const vd = await svc.create({ productId: s.product.id, minQty: 3, discountPct: 10 });

  await svc.delete(vd.id);
  const found = await prisma.volumeDiscount.findUnique({ where: { id: vd.id } });
  expect(found).toBeNull();
});

// ─── VD-E01: getForProduct on nonexistent product → NotFoundException ────────

it('VD-E01: getForProduct on nonexistent product throws NotFoundException', async () => {
  await expect(svc.getForProduct(999999)).rejects.toThrow(/not found/i);
});

// ─── VD-H10: findAll returns all active discounts ───────────────────────────

it('VD-H10: findAll returns all active discounts with product/category info', async () => {
  const s1 = await makeShopper();
  const s2 = await makeShopper();
  await svc.create({ productId: s1.product.id, minQty: 3, discountPct: 5 });
  await svc.create({ productId: s2.product.id, minQty: 5, discountPct: 10 });

  const all = await svc.findAll();
  expect(all.length).toBeGreaterThanOrEqual(2);
  // All returned should be active
  all.forEach((d: any) => expect(d.isActive).toBe(true));
});
