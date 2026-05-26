// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * @shopverse/plugin-price-alerts — W2 pilot.
 *
 * The plugin ships a NestJS DynamicModule (`PriceAlertsPluginModule`)
 * which AppModule statically imports. The module registers its hooks +
 * cron with the kernel's HookRunner / PluginCronRegistry on
 * OnApplicationBootstrap.
 *
 * The plain-object `ShopVersePlugin` shape from W1 stays the
 * DOCUMENTED contract for third-party plugins. The pilot uses the
 * Nest-native module shortcut because (a) it needs the DI graph to
 * resolve PrismaService + EmailService cleanly and (b) third-party
 * dynamic loading + controller attachment is W3+ work. Both shapes
 * end up registering with the same kernel registries — only the
 * wiring path differs.
 */

export { PriceAlertsPluginModule } from './price-alerts.module';
export { PriceAlertsService } from './price-alerts.service';
export { PriceAlertsController } from './price-alerts.controller';
