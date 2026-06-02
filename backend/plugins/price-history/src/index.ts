// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * @shopverse/plugin-price-history — W4.T5.
 *
 * Daily product price snapshots (F3-12). Powers the PDP price-trend
 * chart and any future price-drop analytics. Second W4 plugin
 * extraction after blog (W4.T1).
 *
 * Resolved into AppModule by `resolvePluginModules(pluginsConfig)`
 * (W4.CI1) when `enabled: true` in `backend/plugins.config.ts`.
 */

export { PriceHistoryPluginModule } from './price-history.module';
export { PriceHistoryService } from './price-history.service';
export { PriceHistoryController } from './price-history.controller';
