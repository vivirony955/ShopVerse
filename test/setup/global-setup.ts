// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * Runs once before all test suites.
 * Ensures the test database schema is up to date by running Prisma migrations.
 */
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

export default async function globalSetup() {
  loadEnvFile(path.join(__dirname, '../../backend/.env'));
  loadEnvFile(path.join(__dirname, '../.env.test'));

  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error(
      'DATABASE_URL is not set. Create test/.env.test with TEST_DATABASE_URL or ensure backend/.env exists.',
    );
  }

  // Temporarily rename prisma/.env to avoid DATABASE_URL conflict when running
  // prisma migrate deploy from the backend/ directory (both backend/.env and
  // prisma/.env define DATABASE_URL; Prisma picks up both causing confusion).
  const prismaEnvPath = path.join(__dirname, '../../prisma/.env');
  const prismaEnvBakPath = path.join(__dirname, '../../prisma/.env.bak');
  let renamedPrismaEnv = false;
  if (fs.existsSync(prismaEnvPath)) {
    fs.renameSync(prismaEnvPath, prismaEnvBakPath);
    renamedPrismaEnv = true;
  }

  console.log('\n[Test Setup] Running Prisma migrations on test database…');
  try {
    // Use pipe so we can detect P3005 in the catch block; print output ourselves.
    const migrateOut = execSync('npx prisma migrate deploy', {
      cwd: path.join(__dirname, '../../backend'),
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: 'pipe',
      encoding: 'utf8',
    });
    if (migrateOut) process.stdout.write(migrateOut);
    console.log('[Test Setup] Migrations applied successfully.\n');
  } catch (err: any) {
    const combined = (err.stdout ?? '') + (err.stderr ?? '');
    if (combined) process.stdout.write(combined);

    if (combined.includes('P3005') || combined.includes('schema is not empty')) {
      // DB has tables but no _prisma_migrations history (DB was not set up via migrate).
      // Safe to reset for test databases: drops all tables, re-applies migrations cleanly.
      console.warn('[Test Setup] P3005: migration history missing — resetting test database…');
      execSync('npx prisma migrate reset --force --skip-seed', {
        cwd: path.join(__dirname, '../../backend'),
        env: { ...process.env, DATABASE_URL: dbUrl },
        stdio: 'inherit',
      });
      console.log('[Test Setup] Database reset and migrations applied successfully.\n');
    } else {
      console.error('[Test Setup] Migration failed:', err.message ?? err);
      throw err;
    }
  } finally {
    if (renamedPrismaEnv && fs.existsSync(prismaEnvBakPath)) {
      fs.renameSync(prismaEnvBakPath, prismaEnvPath);
    }
  }

  // Regenerate Prisma client so test imports reflect schema changes (e.g. new models after migrations).
  console.log('[Test Setup] Regenerating Prisma client…');
  try {
    const testClientDir = path.join(__dirname, '../node_modules/.prisma/client');
    execSync(`npx prisma generate --schema=../prisma/schema`, {
      cwd: path.join(__dirname, '../../backend'),
      env: { ...process.env, PRISMA_CLIENT_ENGINE_TYPE: 'library', PRISMA_CLI_QUERY_ENGINE_TYPE: 'library' },
      stdio: 'pipe',
    });
    // Copy generated client to test's node_modules so typed imports work
    const backendClientDir = path.join(__dirname, '../../backend/node_modules/.prisma/client');
    if (fs.existsSync(backendClientDir) && backendClientDir !== testClientDir) {
      execSync(`cp -r "${backendClientDir}/." "${testClientDir}/"`, { stdio: 'pipe' });
    }
    console.log('[Test Setup] Prisma client regenerated.\n');
  } catch {
    console.warn('[Test Setup] Prisma generate warning (non-fatal — raw SQL fallbacks in effect).\n');
  }
}
