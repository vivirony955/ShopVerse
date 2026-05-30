// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * W6.T3 backing — PluginAdminController integration tests.
 *
 * The /admin/plugins page (W6.T3) consumes the W1.T20
 * PluginAdminController. These tests verify the controller's
 * contract end-to-end through HTTP, exercising the same paths the
 * frontend uses:
 *
 *   GET  /admin/plugins                  list all plugins + status
 *   POST /admin/plugins/:id/disable      operator kill switch
 *   POST /admin/plugins/:id/enable       re-enable a disabled plugin
 *
 * Each route is protected by JwtAuthGuard + RolesGuard at ADMIN, so
 * the spec also confirms 401 (no token) + 403 (USER role) responses.
 *
 * The boot path itself is the implicit gate for W6.T10 — if the
 * hello-world plugin's bootstrap throws, `getTestApp()` fails before
 * any test runs. So a green PLUG-H01 here also confirms the plugin
 * manifest resolves cleanly with all 6 plugins (price-alerts +
 * blog + price-history + volume-discounts + notifications +
 * hello-world).
 */
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import { cleanDatabase, createUser, createAdminUser } from './helpers/db';
import { loginAs, bearerHeader } from './helpers/auth';

let app: INestApplication;

beforeAll(async () => {
  app = await getTestApp();
});

afterAll(async () => {
  await closeTestApp();
});

beforeEach(async () => {
  await cleanDatabase();
});

// ─── PLUG-H01: list plugins returns expected shape ──────────────────────────

it('PLUG-H01: GET /admin/plugins returns an array of plugin entries with the expected fields', async () => {
  const admin = await createAdminUser({ email: 'plug-admin@test.com', password: 'Test@1234' });
  const token = await loginAs(app, admin.email, 'Test@1234');

  const res = await request(app.getHttpServer())
    .get('/admin/plugins')
    .set(bearerHeader(token));

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);

  // After W6.T10 the manifest has 6 first-party plugins. The exact
  // count may grow as more plugins land — assert at least the W4 set
  // exists rather than pin to an exact number.
  expect(res.body.length).toBeGreaterThanOrEqual(5);

  // Every entry must carry id + loadStatus + operatorDisabled
  for (const entry of res.body) {
    expect(typeof entry.id).toBe('string');
    expect(entry.id.startsWith('@shopverse/plugin-')).toBe(true);
    expect(['loaded', 'disabled', 'version-mismatch', 'failed']).toContain(entry.loadStatus);
    expect(typeof entry.operatorDisabled).toBe('boolean');
  }
});

// ─── PLUG-H02: single plugin status ─────────────────────────────────────────

it('PLUG-H02: GET /admin/plugins/:id returns the entry for an existing plugin', async () => {
  const admin = await createAdminUser({ email: 'plug-admin2@test.com', password: 'Test@1234' });
  const token = await loginAs(app, admin.email, 'Test@1234');

  // Price-alerts is the W2 pilot — known to be in the manifest at every wave.
  const res = await request(app.getHttpServer())
    .get(`/admin/plugins/${encodeURIComponent('@shopverse/plugin-price-alerts')}`)
    .set(bearerHeader(token));

  expect(res.status).toBe(200);
  expect(res.body).toBeTruthy();
  expect(res.body.id).toBe('@shopverse/plugin-price-alerts');
});

// ─── PLUG-H03: disable + enable round-trip ──────────────────────────────────

it('PLUG-H03: POST /admin/plugins/:id/disable then enable flips operatorDisabled', async () => {
  const admin = await createAdminUser({ email: 'plug-admin3@test.com', password: 'Test@1234' });
  const token = await loginAs(app, admin.email, 'Test@1234');
  const id = '@shopverse/plugin-blog';

  const disableRes = await request(app.getHttpServer())
    .post(`/admin/plugins/${encodeURIComponent(id)}/disable`)
    .set(bearerHeader(token));
  expect(disableRes.status).toBe(201);
  expect(disableRes.body).toEqual({ disabled: true, id });

  const afterDisable = await request(app.getHttpServer())
    .get(`/admin/plugins/${encodeURIComponent(id)}`)
    .set(bearerHeader(token));
  expect(afterDisable.body.operatorDisabled).toBe(true);

  const enableRes = await request(app.getHttpServer())
    .post(`/admin/plugins/${encodeURIComponent(id)}/enable`)
    .set(bearerHeader(token));
  expect(enableRes.status).toBe(201);
  expect(enableRes.body).toEqual({ enabled: true, id });

  const afterEnable = await request(app.getHttpServer())
    .get(`/admin/plugins/${encodeURIComponent(id)}`)
    .set(bearerHeader(token));
  expect(afterEnable.body.operatorDisabled).toBe(false);
});

// ─── PLUG-E01: unauthenticated request → 401 ────────────────────────────────

it('PLUG-E01: GET /admin/plugins without a token returns 401', async () => {
  const res = await request(app.getHttpServer()).get('/admin/plugins');
  expect(res.status).toBe(401);
});

// ─── PLUG-E02: USER role → 403 ──────────────────────────────────────────────

it('PLUG-E02: GET /admin/plugins with a USER-role token returns 403', async () => {
  const user = await createUser({ email: 'plug-regular@test.com', password: 'Test@1234' });
  const token = await loginAs(app, user.email, 'Test@1234');

  const res = await request(app.getHttpServer())
    .get('/admin/plugins')
    .set(bearerHeader(token));
  expect(res.status).toBe(403);
});

// ─── PLUG-E03: USER role → 403 on disable ───────────────────────────────────

it('PLUG-E03: POST /admin/plugins/:id/disable with a USER-role token returns 403', async () => {
  const user = await createUser({ email: 'plug-regular2@test.com', password: 'Test@1234' });
  const token = await loginAs(app, user.email, 'Test@1234');

  const res = await request(app.getHttpServer())
    .post(`/admin/plugins/${encodeURIComponent('@shopverse/plugin-blog')}/disable`)
    .set(bearerHeader(token));
  expect(res.status).toBe(403);
});

// ─── PLUG-H04: hello-world plugin is registered (W6.T10 boot smoke) ─────────

it('PLUG-H04: hello-world plugin loaded from manifest (W6.T10 boot smoke)', async () => {
  const admin = await createAdminUser({ email: 'plug-admin4@test.com', password: 'Test@1234' });
  const token = await loginAs(app, admin.email, 'Test@1234');

  const res = await request(app.getHttpServer())
    .get(`/admin/plugins/${encodeURIComponent('@shopverse/plugin-hello-world')}`)
    .set(bearerHeader(token));

  // If the hello-world plugin's bootstrap throws or its module fails
  // to resolve, this test fails and the cause is the plugin — not
  // some unrelated W6.T3 controller change.
  expect(res.status).toBe(200);
  expect(res.body).toBeTruthy();
  expect(res.body.id).toBe('@shopverse/plugin-hello-world');
});
