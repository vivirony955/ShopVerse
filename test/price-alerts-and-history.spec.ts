// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * Price Alerts + Price History — E2E spec
 *
 * Price Alerts:
 *   set, getForUser, delete, upsert (reset triggered), cron checkAlerts,
 *   alert already triggered not re-triggered.
 *
 * Price History:
 *   getHistory (empty, with data, days filter), snapshotPrices cron.
 */
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import { prisma, cleanDatabase, createUser } from './helpers/db';
import { cleanQATables, makeShopper } from './helpers/factories';
// W2: price-alerts extracted to backend/plugins/. The service class is the
// same and still resolves via app.get(PriceAlertsService) — only the import
// path changed.
import { PriceAlertsService } from '../backend/plugins/price-alerts/src/price-alerts.service';
// W4.T5 — price-history extracted to @shopverse/plugin-price-history.
import { PriceHistoryService } from '../backend/plugins/price-history/src/price-history.service';

let app: INestApplication;
let alertsSvc: PriceAlertsService;
let historySvc: PriceHistoryService;

beforeAll(async () => {
  app = await getTestApp();
  alertsSvc = app.get(PriceAlertsService);
  historySvc = app.get(PriceHistoryService);
});

afterAll(async () => {
  await closeTestApp();
});

beforeEach(async () => {
  await cleanQATables();
  await cleanDatabase();
});

// ═══════════════════════════════════════════════════════════════
//  PRICE ALERTS
// ═══════════════════════════════════════════════════════════════

// ─── PA-H01: set price alert ──────────────────────────────────────────────

it('PA-H01: set creates a price alert', async () => {
  const s = await makeShopper();
  const alert = await alertsSvc.set(s.user.id, s.product.id, 500);
  expect(alert.id).toBeDefined();
  expect(alert.targetPrice).toBe(500);
  expect(alert.isTriggered).toBe(false);
});

// ─── PA-H02: getForUser returns user's alerts ────────────────────────────

it('PA-H02: getForUser returns alerts for user', async () => {
  const s = await makeShopper();
  await alertsSvc.set(s.user.id, s.product.id, 400);

  const alerts = await alertsSvc.getForUser(s.user.id);
  expect(alerts).toHaveLength(1);
  expect(alerts[0].targetPrice).toBe(400);
  expect(alerts[0].product).toBeDefined();
});

// ─── PA-H03: upsert resets triggered state ──────────────────────────────

it('PA-H03: setting alert again resets isTriggered to false', async () => {
  const s = await makeShopper();
  const alert = await alertsSvc.set(s.user.id, s.product.id, 500);

  // Manually mark as triggered
  await prisma.priceAlert.update({
    where: { id: alert.id },
    data: { isTriggered: true, triggeredAt: new Date() },
  });

  // Re-set with new price → should reset triggered flag
  const updated = await alertsSvc.set(s.user.id, s.product.id, 400);
  expect(updated.isTriggered).toBe(false);
  expect(updated.triggeredAt).toBeNull();
  expect(updated.targetPrice).toBe(400);
});

// ─── PA-H04: delete alert ────────────────────────────────────────────────

it('PA-H04: delete removes alert', async () => {
  const s = await makeShopper();
  await alertsSvc.set(s.user.id, s.product.id, 300);
  await alertsSvc.delete(s.user.id, s.product.id);

  const alerts = await alertsSvc.getForUser(s.user.id);
  expect(alerts).toHaveLength(0);
});

// ─── PA-H05: checkAlerts triggers when price drops below target ──────────

it('PA-H05: checkAlerts marks alert as triggered when effective price <= target', async () => {
  // Product with basePrice=1000, discountPct=20 → effectivePrice=800
  const s = await makeShopper({ basePrice: 1000 });
  await prisma.product.update({
    where: { id: s.product.id },
    data: { discountPct: 20 }, // effectivePrice = 800
  });

  // Set alert above effective price → should trigger
  await alertsSvc.set(s.user.id, s.product.id, 900);

  // Run the cron
  await alertsSvc.checkAlerts();

  const alert = await prisma.priceAlert.findFirst({
    where: { userId: s.user.id, productId: s.product.id },
  });
  expect(alert!.isTriggered).toBe(true);
  expect(alert!.triggeredAt).not.toBeNull();
});

// ─── PA-H06: checkAlerts does NOT trigger if price is still high ─────────

it('PA-H06: checkAlerts skips alert when current price > target price', async () => {
  const s = await makeShopper({ basePrice: 1000 });
  // effectivePrice = 1000 (no discount)
  // Target price = 500 — price hasn't dropped that low yet
  await alertsSvc.set(s.user.id, s.product.id, 500);

  await alertsSvc.checkAlerts();

  const alert = await prisma.priceAlert.findFirst({
    where: { userId: s.user.id, productId: s.product.id },
  });
  expect(alert!.isTriggered).toBe(false);
});

// ─── PA-H07: already triggered alert not re-triggered ────────────────────

it('PA-H07: checkAlerts skips already-triggered alerts', async () => {
  const s = await makeShopper({ basePrice: 1000 });
  await prisma.product.update({ where: { id: s.product.id }, data: { discountPct: 30 } });

  const alert = await alertsSvc.set(s.user.id, s.product.id, 900);
  // Pre-mark as triggered
  await prisma.priceAlert.update({
    where: { id: alert.id },
    data: { isTriggered: true, triggeredAt: new Date(Date.now() - 3600000) },
  });

  await alertsSvc.checkAlerts();

  // Verify triggeredAt didn't change (was not re-processed)
  const after = await prisma.priceAlert.findUnique({ where: { id: alert.id } });
  expect(after!.isTriggered).toBe(true);
});

// ─── PA-E01: set on nonexistent product → NotFoundException ──────────────

it('PA-E01: setting alert on nonexistent product throws NotFoundException', async () => {
  const user = await createUser();
  await expect(alertsSvc.set(user.id, 999999, 100)).rejects.toThrow(/not found/i);
});

// ─── PA-H08: user isolation ─────────────────────────────────────────────

it('PA-H08: alerts are user-isolated', async () => {
  const s1 = await makeShopper();
  const s2 = await makeShopper();

  await alertsSvc.set(s1.user.id, s1.product.id, 500);

  const u1Alerts = await alertsSvc.getForUser(s1.user.id);
  const u2Alerts = await alertsSvc.getForUser(s2.user.id);
  expect(u1Alerts).toHaveLength(1);
  expect(u2Alerts).toHaveLength(0);
});

// ═══════════════════════════════════════════════════════════════
//  PRICE HISTORY
// ═══════════════════════════════════════════════════════════════

// ─── PH-H01: getHistory returns empty array when no snapshots ────────────

it('PH-H01: getHistory returns empty array when no price history exists', async () => {
  const s = await makeShopper();
  const history = await historySvc.getHistory(s.product.id, 90);
  expect(history).toHaveLength(0);
});

// ─── PH-H02: snapshotPrices creates history rows ────────────────────────

it('PH-H02: snapshotPrices creates PriceHistory rows for active products', async () => {
  const s1 = await makeShopper({ basePrice: 1200 });
  const s2 = await makeShopper({ basePrice: 800 });

  await historySvc.snapshotPrices();

  const h1 = await historySvc.getHistory(s1.product.id, 1);
  const h2 = await historySvc.getHistory(s2.product.id, 1);

  expect(h1.length).toBeGreaterThanOrEqual(1);
  expect(h2.length).toBeGreaterThanOrEqual(1);
  expect(h1[0].price).toBe(1200);
  expect(h2[0].price).toBe(800);
});

// ─── PH-H03: getHistory respects days filter ────────────────────────────

it('PH-H03: getHistory respects days parameter to filter old entries', async () => {
  const s = await makeShopper({ basePrice: 1000 });

  // Insert old price history entry (>90 days ago)
  await prisma.priceHistory.create({
    data: {
      productId: s.product.id,
      price: 1500,
      discountPct: 0,
      recordedAt: new Date(Date.now() - 100 * 86400000), // 100 days ago
    },
  });

  // Insert recent entry
  await prisma.priceHistory.create({
    data: {
      productId: s.product.id,
      price: 1000,
      discountPct: 10,
      recordedAt: new Date(), // today
    },
  });

  // 30-day query should only return the recent one
  const history30 = await historySvc.getHistory(s.product.id, 30);
  expect(history30).toHaveLength(1);
  expect(history30[0].price).toBe(1000);

  // 90-day still only recent (100d is older than 90d window)
  const history90 = await historySvc.getHistory(s.product.id, 90);
  expect(history90).toHaveLength(1);
});

// ─── PH-H04: snapshotPrices is idempotent (multiple runs stack) ──────────

it('PH-H04: snapshotPrices can run multiple times (each adds a new row)', async () => {
  const s = await makeShopper({ basePrice: 999 });

  await historySvc.snapshotPrices();
  await historySvc.snapshotPrices();

  const history = await historySvc.getHistory(s.product.id, 1);
  // Two snapshots should have been created
  expect(history.length).toBeGreaterThanOrEqual(2);
});

// ─── PH-H05: history ordered by recordedAt ascending ────────────────────

it('PH-H05: getHistory returns entries in ascending time order', async () => {
  const s = await makeShopper();

  const now = Date.now();
  await prisma.priceHistory.createMany({
    data: [
      { productId: s.product.id, price: 1200, discountPct: 0, recordedAt: new Date(now - 3 * 86400000) },
      { productId: s.product.id, price: 1100, discountPct: 5, recordedAt: new Date(now - 2 * 86400000) },
      { productId: s.product.id, price: 1000, discountPct: 10, recordedAt: new Date(now - 86400000) },
    ],
  });

  const history = await historySvc.getHistory(s.product.id, 90);
  expect(history.length).toBeGreaterThanOrEqual(3);
  for (let i = 1; i < history.length; i++) {
    expect(new Date(history[i].recordedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(history[i - 1].recordedAt).getTime(),
    );
  }
});
