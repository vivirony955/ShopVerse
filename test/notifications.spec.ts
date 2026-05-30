// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * Notifications — E2E spec
 *
 * Covers: create, list, unread count, mark-read, mark-all-read, delete,
 * user isolation (another user cannot see/mark/delete).
 */
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import { prisma, cleanDatabase, createUser } from './helpers/db';
import { cleanQATables } from './helpers/factories';
// W4.T13 — notifications extracted to @shopverse/plugin-notifications.
import { NotificationsService } from '../backend/plugins/notifications/src/notifications.service';

let app: INestApplication;
let svc: NotificationsService;

beforeAll(async () => {
  app = await getTestApp();
  svc = app.get(NotificationsService);
});

afterAll(async () => {
  await closeTestApp();
});

beforeEach(async () => {
  await cleanQATables();
  await cleanDatabase();
});

// ─── NOTIF-H01: create and retrieve ────────────────────────────────────────

it('NOTIF-H01: create notification and retrieve for user', async () => {
  const user = await createUser();
  const notif = await svc.create(user.id, 'ORDER_UPDATE', 'Your order shipped', 'Order #123 is on its way', '/orders/123');
  expect(notif.id).toBeDefined();
  expect(notif.userId).toBe(user.id);
  expect(notif.isRead).toBe(false);

  const list = await svc.getForUser(user.id);
  expect(list).toHaveLength(1);
  expect(list[0].title).toBe('Your order shipped');
});

// ─── NOTIF-H02: unread count ────────────────────────────────────────────────

it('NOTIF-H02: unread count reflects unread notifications only', async () => {
  const user = await createUser();
  await svc.create(user.id, 'PROMO', 'Sale today', 'Big sale!');
  await svc.create(user.id, 'ORDER_UPDATE', 'Shipped', 'Order shipped');
  await svc.create(user.id, 'SYSTEM', 'Welcome', 'Welcome to ShopVerse');

  const { count } = await svc.getUnreadCount(user.id);
  expect(count).toBe(3);
});

// ─── NOTIF-H03: mark one as read ───────────────────────────────────────────

it('NOTIF-H03: markRead decrements unread count by 1', async () => {
  const user = await createUser();
  const n1 = await svc.create(user.id, 'A', 'Title 1', 'Body 1');
  await svc.create(user.id, 'B', 'Title 2', 'Body 2');

  await svc.markRead(user.id, n1.id);

  const { count } = await svc.getUnreadCount(user.id);
  expect(count).toBe(1);

  const updated = await prisma.notification.findUnique({ where: { id: n1.id } });
  expect(updated!.isRead).toBe(true);
});

// ─── NOTIF-H04: mark all as read ───────────────────────────────────────────

it('NOTIF-H04: markAllRead sets all notifications to read', async () => {
  const user = await createUser();
  await svc.create(user.id, 'A', 'T1', 'B1');
  await svc.create(user.id, 'B', 'T2', 'B2');
  await svc.create(user.id, 'C', 'T3', 'B3');

  await svc.markAllRead(user.id);

  const { count } = await svc.getUnreadCount(user.id);
  expect(count).toBe(0);
});

// ─── NOTIF-H05: delete notification ────────────────────────────────────────

it('NOTIF-H05: deleteNotification removes the row', async () => {
  const user = await createUser();
  const notif = await svc.create(user.id, 'A', 'T', 'B');
  await svc.deleteNotification(user.id, notif.id);

  const list = await svc.getForUser(user.id);
  expect(list).toHaveLength(0);
});

// ─── NOTIF-E01: user isolation — cannot read others' notifications ──────────

it('NOTIF-E01: user cannot read notifications belonging to another user', async () => {
  const u1 = await createUser();
  const u2 = await createUser();
  await svc.create(u1.id, 'A', 'Private', 'For u1 only');

  const u2List = await svc.getForUser(u2.id);
  expect(u2List).toHaveLength(0);

  const u1Count = await svc.getUnreadCount(u1.id);
  expect(u1Count.count).toBe(1);
  const u2Count = await svc.getUnreadCount(u2.id);
  expect(u2Count.count).toBe(0);
});

// ─── NOTIF-E02: markRead of another user's notification is a no-op ──────────

it('NOTIF-E02: markRead with wrong userId is a no-op (updateMany WHERE guard)', async () => {
  const u1 = await createUser();
  const u2 = await createUser();
  const notif = await svc.create(u1.id, 'A', 'T', 'B');

  // u2 tries to mark u1's notification as read
  await svc.markRead(u2.id, notif.id);

  const n = await prisma.notification.findUnique({ where: { id: notif.id } });
  expect(n!.isRead).toBe(false); // unchanged
});

// ─── NOTIF-E03: delete another user's notification is a no-op ───────────────

it('NOTIF-E03: deleteNotification with wrong userId is a no-op', async () => {
  const u1 = await createUser();
  const u2 = await createUser();
  const notif = await svc.create(u1.id, 'A', 'T', 'B');

  await svc.deleteNotification(u2.id, notif.id);

  const n = await prisma.notification.findUnique({ where: { id: notif.id } });
  expect(n).not.toBeNull(); // still exists
});

// ─── NOTIF-H06: getForUser returns at most 50 (default limit) ───────────────

it('NOTIF-H06: getForUser caps results at 50', async () => {
  const user = await createUser();
  for (let i = 0; i < 60; i++) {
    await svc.create(user.id, 'BULK', `Title ${i}`, `Body ${i}`);
  }

  const list = await svc.getForUser(user.id);
  expect(list.length).toBeLessThanOrEqual(50);
});

// ─── NOTIF-H07: markAllRead only affects requesting user ────────────────────

it('NOTIF-H07: markAllRead does not affect another user\'s notifications', async () => {
  const u1 = await createUser();
  const u2 = await createUser();
  await svc.create(u1.id, 'A', 'For u1', 'B');
  await svc.create(u2.id, 'A', 'For u2', 'B');

  await svc.markAllRead(u1.id);

  const u2Count = await svc.getUnreadCount(u2.id);
  expect(u2Count.count).toBe(1); // u2's notification unchanged
});
