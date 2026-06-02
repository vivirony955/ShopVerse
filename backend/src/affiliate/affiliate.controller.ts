// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AffiliateService } from './affiliate.service';
import { CreateAffiliateDto, TrackAttributionDto } from './dto/affiliate.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Role, Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../common/types';

@ApiTags('Affiliate')
@ApiBearerAuth('JWT')
@Controller('affiliate')
@UseGuards(JwtAuthGuard)
export class AffiliateController {
  constructor(private readonly svc: AffiliateService) {}

  @Get('me')
  myAccount(@CurrentUser() user: AuthUser) {
    return this.svc.getAccount(user.id);
  }

  @Post('track')
  track(@Body() dto: TrackAttributionDto) {
    return this.svc.trackAttribution(dto);
  }

  // Admin
  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateAffiliateDto) {
    return this.svc.createAccount(dto);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  list() {
    return this.svc.listAccounts();
  }

  @Get(':id/attributions')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  attributions(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getAttributionsByAffiliate(id);
  }

  @Get('campaign/report')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  campaignReport(@Query('utm_campaign') campaign: string) {
    return this.svc.getCampaignReport(campaign);
  }

  @Get('me/payout')
  myPayoutSummary(@CurrentUser() user: AuthUser) {
    return this.svc.getPayoutSummary(user.id);
  }

  @Post('payouts/process')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  processPayouts() {
    return this.svc.processPendingPayouts();
  }
}
