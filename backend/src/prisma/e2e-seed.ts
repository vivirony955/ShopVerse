// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * E2E seed: creates test users + products so Playwright tests have data to
 * work with. Run from backend/: npx ts-node src/prisma/e2e-seed.ts
 *
 * Idempotent — safe to run multiple times. Existing rows are skipped.
 *
 * Users created (must match frontend/e2e/helpers.ts TEST_USER / TEST_ADMIN):
 *   - e2e_test@shopverse.local  / Test@1234   (USER role)
 *   - e2e_admin@shopverse.local / Admin@1234  (ADMIN role)
 *
 * Without these the Playwright suite's user.setup.ts and admin.setup.ts
 * tasks fail at login, cascading every authenticated test to red.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedUsers() {
  const users: Array<{ email: string; password: string; firstName: string; role: 'USER' | 'ADMIN' }> = [
    { email: 'e2e_test@shopverse.local',  password: 'Test@1234',  firstName: 'E2E',      role: 'USER' },
    { email: 'e2e_admin@shopverse.local', password: 'Admin@1234', firstName: 'E2EAdmin', role: 'ADMIN' },
  ];

  for (const u of users) {
    // Upsert so a re-run resets the password back to the canonical value.
    // Important when a previous spec mutated the password (e.g. password-
    // change tests) or an earlier seed used a different hash.
    const hashed = await bcrypt.hash(u.password, 10);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { password: hashed, firstName: u.firstName, role: u.role },
      create: {
        email: u.email,
        password: hashed,
        firstName: u.firstName,
        role: u.role,
      },
    });
    console.log(`Seeded ${u.role}: ${user.email} (id=${user.id})`);
  }
}

async function seedCategories() {
  // Three extra categories so /admin/categories has a populated table
  // for ACAT-02 ("name/slug/products columns" test). All upserts are
  // idempotent on slug.
  const cats = [
    { name: 'E2E Apparel', slug: 'e2e-apparel' },
    { name: 'E2E Accessories', slug: 'e2e-accessories' },
    { name: 'E2E Footwear', slug: 'e2e-footwear' },
  ];
  for (const c of cats) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: c,
    });
  }
  console.log(`Seeded ${cats.length} extra categor` +
    `${cats.length === 1 ? 'y' : 'ies'}`);
}

async function main() {
  // Users first — Playwright's user.setup.ts / admin.setup.ts log in with
  // these credentials BEFORE any tests run. Without them every chromium-user
  // and chromium-admin test fails at setup.
  await seedUsers();
  await seedCategories();

  // Upsert category + brand
  // Display name avoids the substring "Category" because the navbar's
  // "All Categories" dropdown renders every category as a hidden link
  // with .first()-match ambiguity for the ACAT-02 test
  // (getByText(/category/i).first() picks a hidden navbar entry
  // instead of the visible page heading). The slug stays
  // 'e2e-category' for backwards compatibility with anything that
  // looks it up by slug. update: clause is non-empty so a re-run
  // resets older 'E2E Category' rows to the new name.
  const cat = await prisma.category.upsert({
    where: { slug: 'e2e-category' },
    update: { name: 'E2E Default' },
    create: { name: 'E2E Default', slug: 'e2e-category' },
  });

  const brand = await prisma.brand.upsert({
    where: { slug: 'e2e-brand' },
    update: {},
    create: { name: 'E2E Brand', slug: 'e2e-brand' },
  });

  // Create 5 test products
  for (let i = 1; i <= 5; i++) {
    const slug = `e2e-product-${i}`;
    const existing = await prisma.product.findUnique({ where: { slug } });
    if (!existing) {
      const product = await prisma.product.create({
        data: {
          name: `E2E Test Product ${i}`,
          slug,
          description: `Test product ${i} created for E2E tests`,
          categoryId: cat.id,
          brandId: brand.id,
          basePrice: 999 + i * 100,
          discountPct: 10,
          images: ['https://placehold.co/400x500/6366f1/white?text=Product'],
          tags: ['e2e', 'test'],
          isActive: true,
        },
      });
      await prisma.variant.create({
        data: {
          productId: product.id,
          size: 'M',
          color: 'Blue',
          stock: 50,
          sku: `E2E-SKU-${i}-${Date.now()}`,
        },
      });
      console.log(`Created product: ${product.name} (id=${product.id})`);
    } else {
      console.log(`Product already exists: ${slug}`);
    }
  }

  console.log('E2E seed complete.');
}

main()
  .catch(console.error)
  .finally(() => {
    void prisma.$disconnect();
  });
