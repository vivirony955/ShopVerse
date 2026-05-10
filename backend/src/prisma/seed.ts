/**
 * Prisma seed script — creates the first admin user if none exists.
 *
 * Run with: npx ts-node src/prisma/seed.ts
 * Or add to package.json:  "prisma": { "seed": "ts-node src/prisma/seed.ts" }
 * Then: npx prisma db seed
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@store.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@123456';

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    console.log(`Admin already exists: ${adminEmail}`);
    return;
  }

  const hashed = await bcrypt.hash(adminPassword, 12);
  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      password: hashed,
      firstName: 'Admin',
      role: 'ADMIN',
    },
  });

  console.log(`Admin created: ${admin.email} (id=${admin.id})`);
  console.log('Change the password immediately after first login.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
