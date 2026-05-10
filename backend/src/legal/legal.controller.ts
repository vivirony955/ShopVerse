// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { LegalService } from './legal.service';
import { CookieConsentDto, CreatePolicyDto } from './dto/legal.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Role, Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { PolicyType } from '@prisma/client';
import { AuthUser, AuthenticatedRequest } from '../common/types';

@Controller('legal')
export class LegalController {
  constructor(private readonly svc: LegalService) {}

  @Get('policies')
  allPolicies() {
    return this.svc.getAllPolicies();
  }

  @Get('policies/:type')
  getPolicy(@Param('type') type: PolicyType) {
    return this.svc.getActivePolicy(type);
  }

  @Get('policies/:type/history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  history(@Param('type') type: PolicyType) {
    return this.svc.getPolicyHistory(type);
  }

  @Post('policies')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  create(@Body() dto: CreatePolicyDto) {
    return this.svc.createPolicy(dto);
  }

  @Post('consent/cookies')
  cookieConsent(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CookieConsentDto,
  ) {
    const userId = req.user?.id;
    const ip = req.ip ?? '';
    return this.svc.recordCookieConsent(userId, ip, dto);
  }

  @Get('consent/cookies/me')
  @UseGuards(JwtAuthGuard)
  myConsent(@CurrentUser() user: AuthUser) {
    return this.svc.getLatestConsent(user.id);
  }
}
