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
    if (!process.env[key]) process.env[key] = val;
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

// Cap Prisma connection pool so 37 spec files + NestJS don't exceed PG max_connections.
// With --runInBand (single process) every spec's NestJS app and PrismaClient share the
// same PG server. Default pool is 5; capping at 3 stays well under 100.
if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('connection_limit')) {
  const sep = process.env.DATABASE_URL.includes('?') ? '&' : '?';
  process.env.DATABASE_URL += `${sep}connection_limit=3`;
}

// Silence console.log from NestJS bootstrap during tests
if (!process.env.VERBOSE_TESTS) {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
}
