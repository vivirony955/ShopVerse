// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * @shopverse/plugin-blog — W4.T1.
 *
 * First-party Tier 3 plugin: pure content CMS over a single BlogPost
 * table. Migrated out of the kernel after the W2 pilot validated the
 * NestJS DynamicModule plugin pattern.
 *
 * Resolved into AppModule by `resolvePluginModules(pluginsConfig)`
 * (W4.CI1) when `enabled: true` in `backend/plugins.config.ts`.
 */

export { BlogPluginModule } from './blog.module';
export { BlogService } from './blog.service';
export { BlogController } from './blog.controller';
