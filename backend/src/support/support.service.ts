// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, NotFoundException } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddNoteDto,
  AdminNoteDto,
  CreateTicketDto,
  UpdateTicketDto,
} from './dto/support.dto';

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  async createTicket(userId: number, dto: CreateTicketDto) {
    return this.prisma.supportTicket.create({
      data: {
        userId,
        orderId: dto.orderId,
        subject: dto.subject,
        description: dto.description,
        priority: dto.priority,
      },
    });
  }

  async getMyTickets(userId: number) {
    return this.prisma.supportTicket.findMany({
      where: { userId },
      include: {
        notes: { where: { isInternal: false }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getAllTickets(status?: TicketStatus) {
    return this.prisma.supportTicket.findMany({
      where: status ? { status } : {},
      include: {
        notes: true,
        user: { select: { id: true, email: true, firstName: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async getTicket(id: number) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: { notes: { orderBy: { createdAt: 'asc' } }, user: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async updateTicket(id: number, dto: UpdateTicketDto) {
    const data: any = { ...dto };
    if (dto.status === TicketStatus.RESOLVED) {
      data.resolvedAt = new Date();
    }
    return this.prisma.supportTicket.update({ where: { id }, data });
  }

  async addNote(ticketId: number, authorId: number, dto: AddNoteDto) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const note = await this.prisma.ticketNote.create({
      data: {
        ticketId,
        authorId,
        body: dto.body,
        isInternal: dto.isInternal ?? true,
      },
    });

    // Move ticket to in-progress when staff responds
    if (!dto.isInternal && ticket.status === TicketStatus.OPEN) {
      await this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: TicketStatus.IN_PROGRESS },
      });
    }

    return note;
  }

  async addAdminNote(authorId: number, dto: AdminNoteDto) {
    return this.prisma.adminNote.create({
      data: {
        authorId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        body: dto.body,
      },
    });
  }

  async getAdminNotes(targetType: string, targetId: number) {
    return this.prisma.adminNote.findMany({
      where: { targetType, targetId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** SLA metrics: tickets open beyond threshold */
  async getSlaReport() {
    const now = new Date();
    const urgentSlaHours = 4;
    const highSlaHours = 8;
    const medSlaHours = 24;

    const breached = await this.prisma.supportTicket.findMany({
      where: {
        status: { notIn: [TicketStatus.RESOLVED, TicketStatus.CLOSED] },
        OR: [
          {
            priority: 'URGENT',
            createdAt: {
              lte: new Date(now.getTime() - urgentSlaHours * 3600_000),
            },
          },
          {
            priority: 'HIGH',
            createdAt: {
              lte: new Date(now.getTime() - highSlaHours * 3600_000),
            },
          },
          {
            priority: 'MEDIUM',
            createdAt: {
              lte: new Date(now.getTime() - medSlaHours * 3600_000),
            },
          },
        ],
      },
      include: { user: { select: { id: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return { breachedCount: breached.length, tickets: breached };
  }
}
