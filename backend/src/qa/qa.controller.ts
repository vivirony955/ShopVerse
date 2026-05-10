// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { QaService } from './qa.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('qa')
export class QaController {
  constructor(private readonly svc: QaService) {}

  @Get('products/:productId')
  getForProduct(@Param('productId', ParseIntPipe) productId: number) {
    return this.svc.getForProduct(productId);
  }

  @Post('products/:productId')
  @UseGuards(JwtAuthGuard)
  ask(
    @CurrentUser() user: any,
    @Param('productId', ParseIntPipe) productId: number,
    @Body('question') question: string,
  ) {
    return this.svc.ask(user.id, productId, question);
  }

  @Patch(':id/answer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.CS_AGENT)
  answer(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number, @Body('answer') answer: string) {
    return this.svc.answer(id, user.id, answer);
  }

  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  approve(@Param('id', ParseIntPipe) id: number) {
    return this.svc.approve(id);
  }

  @Get('admin/pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.CS_AGENT)
  getPending() {
    return this.svc.getPending();
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  delete(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user.role);
    return this.svc.deleteQuestion(id, user.id, isAdmin);
  }
}
