// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SupportService } from './support.service';
import {
  AddNoteDto,
  AdminNoteDto,
  CreateTicketDto,
  UpdateTicketDto,
} from './dto/support.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Role, Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../common/types';
import { TicketStatus } from '@prisma/client';

@ApiTags('Support')
@ApiBearerAuth('JWT')
@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly svc: SupportService) {}

  @Post('tickets')
  createTicket(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.svc.createTicket(user.id, dto);
  }

  @Get('tickets/my')
  myTickets(@CurrentUser() user: AuthUser) {
    return this.svc.getMyTickets(user.id);
  }

  @Get('tickets/:id')
  getTicket(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getTicket(id);
  }

  @Post('tickets/:id/notes')
  addNote(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: AddNoteDto,
  ) {
    return this.svc.addNote(id, user.id, dto);
  }

  // Admin
  @Get('admin/tickets')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  allTickets(@Query('status') status?: TicketStatus) {
    return this.svc.getAllTickets(status);
  }

  @Patch('admin/tickets/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  updateTicket(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.svc.updateTicket(id, dto);
  }

  @Post('admin/notes')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  adminNote(@CurrentUser() user: AuthUser, @Body() dto: AdminNoteDto) {
    return this.svc.addAdminNote(user.id, dto);
  }

  @Get('admin/notes')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  getAdminNotes(
    @Query('type') type: string,
    @Query('targetId', ParseIntPipe) targetId: number,
  ) {
    return this.svc.getAdminNotes(type, targetId);
  }

  @Get('admin/sla')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  slaReport() {
    return this.svc.getSlaReport();
  }
}
