// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.
//
// ShopVerse page screenshot tool — run from frontend/ with:
//   node screenshots.mjs

import { chromium } from '@playwright/test';
import { mkdirSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE      = 'http://localhost:3000';
const API       = 'http://localhost:4000';
const OUT       = resolve(__dirname, '../docs/screenshots');
const VIEWPORT  = { width: 1440, height: 900 };
const SETTLE    = 2000;

mkdirSync(OUT, { recursive: true });

// ── page definitions ─────────────────────────────────────────────────────────

const PUBLIC = [
  { name: '01-home',           url: '/' },
  { name: '02-products',       url: '/products' },
  { name: '03-flash-sales',    url: '/flash-sales' },
  { name: '04-blog',           url: '/blog' },
  { name: '05-compare',        url: '/compare' },
  { name: '06-support',        url: '/support' },
  { name: '07-login',          url: '/login' },
  { name: '08-register',       url: '/register' },
];

const CUSTOMER = [
  { name: '09-checkout',       url: '/checkout' },
  { name: '10-orders',         url: '/orders' },
  { name: '11-wallet',         url: '/wallet' },
  { name: '12-wishlist',       url: '/wishlist' },
  { name: '13-loyalty',        url: '/loyalty' },
  { name: '14-profile',        url: '/profile' },
  { name: '15-referral',       url: '/referral' },
];

const ADMIN = [
  { name: '16-admin-dashboard',  url: '/admin' },
  { name: '17-admin-products',   url: '/admin/products' },
  { name: '18-admin-orders',     url: '/admin/orders' },
  { name: '19-admin-users',      url: '/admin/users' },
  { name: '20-admin-inventory',  url: '/admin/inventory' },
  { name: '21-admin-warehouses', url: '/admin/warehouses' },
  { name: '22-admin-analytics',  url: '/admin/analytics' },
  { name: '23-admin-finance',    url: '/admin/finance' },
  { name: '24-admin-coupons',    url: '/admin/coupons' },
  { name: '25-admin-flash-sales',url: '/admin/flash-sales' },
  { name: '26-admin-fraud',      url: '/admin/fraud' },
  { name: '27-admin-refunds',    url: '/admin/refund-approvals' },
  { name: '28-admin-audit',      url: '/admin/audit' },
];

// ── helpers ───────────────────────────────────────────────────────────────────

async function snap(page, name, url) {
  const dest = resolve(OUT, `${name}.png`);
  try {
    await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    // Wait for the page's main content element
    await page.waitForSelector('main, [role="main"], #__next > div, body > div', { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(SETTLE);
    await page.screenshot({ path: dest, fullPage: true });
    console.log(`  ✓  ${name}`);
  } catch (e) {
    console.log(`  ✗  ${name}  (${e.message.split('\n')[0]})`);
  }
}

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.locator('input[type="email"], input[name="email"]').first().fill(email).catch(() => {});
  await page.locator('input[type="password"]').first().fill(password).catch(() => {});
  await page.locator('button[type="submit"]').first().click().catch(async () => {
    await page.keyboard.press('Enter');
  });
  await page.waitForTimeout(2500);
  const url = page.url();
  const ok  = !url.includes('/login');
  console.log(`  ${ok ? '✓' : '✗'}  login as ${email}${ok ? '' : ' (stayed on login page — credentials may differ)'}`);
  return ok;
}

// ── main ──────────────────────────────────────────────────────────────────────

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ── public pages (no auth) ───────────────────────────────
  console.log('\n── Public pages ──────────────────────────────────');
  {
    const ctx  = await browser.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();
    page.on('console', () => {}); page.on('pageerror', () => {});
    for (const p of PUBLIC) await snap(page, p.name, p.url);
    await ctx.close();
  }

  // ── customer pages ───────────────────────────────────────
  console.log('\n── Customer pages (customer@shopverse.dev) ────────');
  {
    const ctx  = await browser.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();
    page.on('console', () => {}); page.on('pageerror', () => {});
    await login(page, 'customer@shopverse.dev', 'customer123');
    for (const p of CUSTOMER) await snap(page, p.name, p.url);
    await ctx.close();
  }

  // ── admin pages ──────────────────────────────────────────
  console.log('\n── Admin pages (admin@shopverse.dev) ──────────────');
  {
    const ctx  = await browser.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();
    page.on('console', () => {}); page.on('pageerror', () => {});
    await login(page, 'admin@shopverse.dev', 'admin123');
    for (const p of ADMIN) await snap(page, p.name, p.url);
    await ctx.close();
  }

  await browser.close();

  const taken = readdirSync(OUT).filter(f => f.endsWith('.png')).length;
  console.log(`\n✓ ${taken} screenshots → docs/screenshots/\n`);
})();
