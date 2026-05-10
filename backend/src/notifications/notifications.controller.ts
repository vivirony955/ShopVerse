// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Controller, Get, Patch, Delete, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  getAll(@CurrentUser() user: any) {
    return this.svc.getForUser(user.id);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: any) {
    return this.svc.getUnreadCount(user.id);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.svc.markRead(user.id, id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: any) {
    return this.svc.markAllRead(user.id);
  }

  @Delete(':id')
  delete(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteNotification(user.id, id);
  }
}
