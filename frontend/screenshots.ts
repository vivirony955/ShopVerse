// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.
//
// Standalone Playwright screenshot script — captures all key pages at 1440px.
// Run: npx ts-node screenshots.ts  (from frontend/ directory, with servers running)

import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE = 'http://localhost:3000';
const OUT  = path.resolve(__dirname, '../docs/screenshots');
const VIEWPORT = { width: 1440, height: 900 };

// Wait after navigation so JS-rendered content settles
const SETTLE_MS = 1800;

interface PageDef {
  name: string;
  url: string;
  fullPage?: boolean;
  auth?: boolean;     // requires login
  waitFor?: string;   // CSS selector to wait for before screenshotting
}

const PUBLIC_PAGES: PageDef[] = [
  { name: '01-home',              url: '/',                         fullPage: true,  waitFor: 'main' },
  { name: '02-products',          url: '/products',                 fullPage: true,  waitFor: 'main' },
  { name: '03-product-detail',    url: '/products/1',               fullPage: true,  waitFor: 'main' },
  { name: '04-login',             url: '/login',                    fullPage: true,  waitFor: 'form' },
  { name: '05-register',          url: '/register',                 fullPage: true,  waitFor: 'form' },
  { name: '06-flash-sales',       url: '/flash-sales',              fullPage: true,  waitFor: 'main' },
  { name: '07-blog',              url: '/blog',                     fullPage: true,  waitFor: 'main' },
  { name: '08-compare',           url: '/compare',                  fullPage: true,  waitFor: 'main' },
  { name: '09-support',           url: '/support',                  fullPage: true,  waitFor: 'main' },
];

const AUTH_PAGES: PageDef[] = [
  { name: '10-cart-checkout',     url: '/checkout',                 fullPage: true,  auth: true, waitFor: 'main' },
  { name: '11-orders',            url: '/orders',                   fullPage: true,  auth: true, waitFor: 'main' },
  { name: '12-wallet',            url: '/wallet',                   fullPage: true,  auth: true, waitFor: 'main' },
  { name: '13-wishlist',          url: '/wishlist',                 fullPage: true,  auth: true, waitFor: 'main' },
  { name: '14-loyalty',           url: '/loyalty',                  fullPage: true,  auth: true, waitFor: 'main' },
  { name: '15-profile',           url: '/profile',                  fullPage: true,  auth: true, waitFor: 'main' },
  { name: '16-referral',          url: '/referral',                 fullPage: true,  auth: true, waitFor: 'main' },
];

const ADMIN_PAGES: PageDef[] = [
  { name: '17-admin-dashboard',   url: '/admin',                    fullPage: true,  auth: true, waitFor: 'main' },
  { name: '18-admin-products',    url: '/admin/products',           fullPage: true,  auth: true, waitFor: 'main' },
  { name: '19-admin-orders',      url: '/admin/orders',             fullPage: true,  auth: true, waitFor: 'main' },
  { name: '20-admin-users',       url: '/admin/users',              fullPage: true,  auth: true, waitFor: 'main' },
  { name: '21-admin-inventory',   url: '/admin/inventory',          fullPage: true,  auth: true, waitFor: 'main' },
  { name: '22-admin-warehouses',  url: '/admin/warehouses',         fullPage: true,  auth: true, waitFor: 'main' },
  { name: '23-admin-analytics',   url: '/admin/analytics',          fullPage: true,  auth: true, waitFor: 'main' },
  { name: '24-admin-finance',     url: '/admin/finance',            fullPage: true,  auth: true, waitFor: 'main' },
  { name: '25-admin-coupons',     url: '/admin/coupons',            fullPage: true,  auth: true, waitFor: 'main' },
  { name: '26-admin-flash-sales', url: '/admin/flash-sales',        fullPage: true,  auth: true, waitFor: 'main' },
  { name: '27-admin-fraud',       url: '/admin/fraud',              fullPage: true,  auth: true, waitFor: 'main' },
  { name: '28-admin-refunds',     url: '/admin/refund-approvals',   fullPage: true,  auth: true, waitFor: 'main' },
  { name: '29-admin-audit',       url: '/admin/audit',              fullPage: true,  auth: true, waitFor: 'main' },
];

async function screenshot(page: any, def: PageDef) {
  const dest = path.join(OUT, `${def.name}.png`);
  try {
    await page.goto(`${BASE}${def.url}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    if (def.waitFor) {
      await page.waitForSelector(def.waitFor, { timeout: 8000 }).catch(() => {});
    }
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: dest, fullPage: def.fullPage ?? true });
    console.log(`  ✓ ${def.name}`);
  } catch (e: any) {
    console.log(`  ✗ ${def.name} — ${e.message?.split('\n')[0]}`);
  }
}

async function login(page: any, email: string, password: string) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForSelector('form', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);

  // Fill login form — try common field patterns
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passInput  = page.locator('input[type="password"]').first();

  await emailInput.fill(email).catch(() => {});
  await passInput.fill(password).catch(() => {});
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page    = await context.newPage();

  // Suppress console noise from the page
  page.on('console', () => {});
  page.on('pageerror', () => {});

  console.log('\n── Public pages ──────────────────────────────');
  for (const def of PUBLIC_PAGES) {
    await screenshot(page, def);
  }

  console.log('\n── Customer pages (logged in) ────────────────');
  await login(page, 'customer@shopverse.dev', 'customer123');
  for (const def of AUTH_PAGES) {
    await screenshot(page, def);
  }

  // Admin login in a fresh context
  const adminCtx  = await browser.newContext({ viewport: VIEWPORT });
  const adminPage = await adminCtx.newPage();
  adminPage.on('console', () => {});
  adminPage.on('pageerror', () => {});

  console.log('\n── Admin pages (admin logged in) ─────────────');
  await login(adminPage, 'admin@shopverse.dev', 'admin123');
  for (const def of ADMIN_PAGES) {
    await screenshot(adminPage, def);
  }

  await browser.close();

  const taken = fs.readdirSync(OUT).filter(f => f.endsWith('.png')).length;
  console.log(`\nDone — ${taken} screenshots saved to docs/screenshots/\n`);
})();
