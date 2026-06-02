// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * No bootstrap class — notifications has no cron, no event subscriber,
 * and no kernel hook to register. The user.beforeDelete hook is NOT
 * needed because `Notification.userId → User` has `onDelete: Cascade`
 * in the Prisma schema; deleting a User automatically removes their
 * notifications at the DB level.
 *
 * The producer side is intentionally empty today. The W4 tracker noted
 * "notifications already subscribes to events conceptually" — that was
 * speculative; the existing service is pure CRUD, no kernel module
 * calls `notificationsService.create()` inline. When a future need
 * arrives (e.g., "create notification on order.delivered"), the right
 * shape is a kernel-side event subscriber that calls into this
 * service — same pattern as the W3 order-cashback subscriber. Tracking
 * as a W5/W6 follow-on, not a W4.T13 task.
 *
 * `exports: [NotificationsService]` is retained for backward compat,
 * but no kernel module imports it today.
 */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsPluginModule {}
