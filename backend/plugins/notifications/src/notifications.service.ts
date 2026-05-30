// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable } from '@nestjs/common';
// W4.T13 grandfathered import — PrismaService is kernel infra; SDK
// re-export under W4.CI3 (continuous).
import { PrismaService } from '../../../src/prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: number,
    type: string,
    title: string,
    body: string,
    link?: string,
  ) {
    return this.prisma.notification.create({
      data: { userId, type, title, body, link },
    });
  }

  async getForUser(userId: number) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getUnreadCount(userId: number) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  async markRead(userId: number, id: number) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: number) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async deleteNotification(userId: number, id: number) {
    return this.prisma.notification.deleteMany({ where: { id, userId } });
  }
}
