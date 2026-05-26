// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * @shopverse/plugin-price-alerts — W2 pilot plugin.
 *
 * Proves the plugin runtime end-to-end:
 *   - SDK-only imports (no `@backend/*`)
 *   - kernel.db access for the plugin-owned PriceAlert table
 *   - user.beforeDelete hook for GDPR/DPDP cascade
 *   - cron registration (every hour)
 *   - REST controller exposed via kernel.api.registerRoutes
 *
 * Until the kernel's dynamic controller-attach lands (W2 session 2),
 * this plugin object exists as a parallel implementation alongside
 * the legacy `backend/src/price-alerts/` kernel module. The legacy
 * module serves production traffic; this plugin proves the SDK
 * surface compiles + smoke-tests.
 */

import type { PrismaClient } from '@prisma/client';
import type { ShopVersePlugin, KernelContext } from '@shopverse/sdk';
import { PriceAlertsService } from './price-alerts.service';
import { PriceAlertsController } from './price-alerts.controller';

const PLUGIN_ID = '@shopverse/plugin-price-alerts';
const VERSION = '0.1.0-alpha.1';

/**
 * Email payload published over the kernel event bus when a price
 * crosses a user's threshold. The kernel's email worker (subscribed
 * to this topic in main.prisma's catalog services) handles the SMTP
 * send so this plugin never touches EmailService directly.
 */
export interface PriceDropEvent {
  readonly userId: number;
  readonly productId: number;
  readonly productName: string;
  readonly productSlug: string;
  readonly currentPrice: number;
  readonly targetPrice: number;
}

export const PRICE_DROP_TOPIC = '@shopverse/plugin-price-alerts.price-drop';

const plugin: ShopVersePlugin = {
  id: PLUGIN_ID,
  version: VERSION,
  kernelVersion: '^0.1.0',

  async onRegister(kernel: KernelContext) {
    // Cast through unknown because the SDK keeps `db` as a structural
    // record to avoid hard-depending on @prisma/client. Real type info
    // is the @prisma/client peer dep this plugin declares.
    const db = kernel.db as unknown as PrismaClient;
    const service = new PriceAlertsService(db, kernel);

    // GDPR / DPDP cascade — kernel calls this hook before deleting a
    // User; we delete the user's alerts so no orphan rows remain.
    kernel.hooks.register('user.beforeDelete', async (ctx) => {
      await service.deleteAllForUser(ctx.userId);
    });

    // Hourly cron — scans active alerts, publishes price-drop events.
    kernel.crons.register({
      name: 'check-alerts',
      intervalMinutes: 60,
      handler: () => service.checkAlerts(),
    });

    // REST routes under /api/plugin/price-alerts/* (lint rule
    // `plugin-route-prefix` enforces the prefix in the controller).
    kernel.api.registerRoutes(PriceAlertsController, {
      tag: 'Plugin: Price Alerts',
    });

    // Make the service accessible to the controller via a side-channel
    // (set on the kernel's logger metadata for now — a proper Nest DI
    // wiring lands when controller attachment ships in W2 session 2).
    PriceAlertsController.bindService(service);

    kernel.logger.log('Price-alerts plugin registered (cron + hook + routes)');
  },
};

export default plugin;
export { plugin };
export { PriceAlertsService } from './price-alerts.service';
export { PriceAlertsController } from './price-alerts.controller';
