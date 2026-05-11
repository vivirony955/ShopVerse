// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * Loads environment variables before any test runs.
 * Uses TEST_DATABASE_URL if set, falls back to DATABASE_URL from backend/.env.
 */
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
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

// Load backend .env first
loadEnvFile(path.join(__dirname, '../../backend/.env'));
// Then load test-specific .env.test (overrides)
loadEnvFile(path.join(__dirname, '../.env.test'));

// If a dedicated TEST_DATABASE_URL is provided, use it as DATABASE_URL for all tests
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

// Force Prisma connection pool to 3 for tests.
// CI sets connection_limit=30 which exhausts PG's max_connections=100 across 39 sequential
// specs (each spec's NestJS PrismaService opens up to 30 connections). Use URL.searchParams
// to unconditionally replace any existing value rather than the previous append-if-absent guard.
if (process.env.DATABASE_URL) {
  try {
    const dbUrl = new URL(process.env.DATABASE_URL);
    dbUrl.searchParams.set('connection_limit', '3');
    dbUrl.searchParams.set('pool_timeout', '30');
    process.env.DATABASE_URL = dbUrl.toString();
  } catch {
    // Non-URL format: fall back to append-if-absent
    if (!process.env.DATABASE_URL.includes('connection_limit')) {
      const sep = process.env.DATABASE_URL.includes('?') ? '&' : '?';
      process.env.DATABASE_URL += `${sep}connection_limit=3&pool_timeout=30`;
    }
  }
}

// Mark process as test environment so BullMQ skips Redis retry (ECONNREFUSED noise).
if (!process.env.NODE_ENV) {
  (process.env as Record<string, string>).NODE_ENV = 'test';
}

// Silence console.log from NestJS bootstrap during tests
if (!process.env.VERBOSE_TESTS) {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
}
