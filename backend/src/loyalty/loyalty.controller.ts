// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LoyaltyService } from './loyalty.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types';

@ApiTags('Loyalty')
@ApiBearerAuth('JWT')
@Controller('loyalty')
@UseGuards(JwtAuthGuard)
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get('balance')
  getBalance(@Request() req: AuthenticatedRequest) {
    return this.loyaltyService.getBalance(req.user.id);
  }

  @Get('history')
  getHistory(@Request() req: AuthenticatedRequest) {
    return this.loyaltyService.getHistory(req.user.id);
  }
}
