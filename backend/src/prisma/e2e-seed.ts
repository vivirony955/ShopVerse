/**
 * E2E seed: creates test products so Playwright tests have data to work with.
 * Run from backend/: npx ts-node src/prisma/e2e-seed.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Upsert category + brand
  const cat = await prisma.category.upsert({
    where: { slug: 'e2e-category' },
    update: {},
    create: { name: 'E2E Category', slug: 'e2e-category' },
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
  .finally(() => prisma.$disconnect());
