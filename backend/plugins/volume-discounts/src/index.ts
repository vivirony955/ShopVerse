// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * @shopverse/plugin-volume-discounts — W4.T9.
 *
 * Tiered quantity discounts per product or category (F4-08). Pure
 * CRUD + a `getBestDiscount(productId, qty)` helper. No kernel
 * consumer today; if pricing ever needs volume discounts it'll come
 * through a `DiscountStrategy` registration, not a direct import.
 *
 * Resolved into AppModule by `resolvePluginModules(pluginsConfig)`
 * (W4.CI1) when `enabled: true` in `backend/plugins.config.ts`.
 */

export { VolumeDiscountsPluginModule } from './volume-discounts.module';
export { VolumeDiscountsService } from './volume-discounts.service';
export { VolumeDiscountsController } from './volume-discounts.controller';
