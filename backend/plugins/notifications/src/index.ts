// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * @shopverse/plugin-notifications — W4.T13.
 *
 * In-app notification center (F2-06). Per-user CRUD over a
 * Notification table. Fourth and final W4 plugin migration —
 * completes the wave's plan-§3 Tier 3 extraction set.
 *
 * Resolved into AppModule by `resolvePluginModules(pluginsConfig)`
 * (W4.CI1) when `enabled: true` in `backend/plugins.config.ts`.
 */

export { NotificationsPluginModule } from './notifications.module';
export { NotificationsService } from './notifications.service';
export { NotificationsController } from './notifications.controller';
