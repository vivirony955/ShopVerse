// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('loyalty')
@UseGuards(JwtAuthGuard)
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get('balance')
  getBalance(@Request() req: any) { return this.loyaltyService.getBalance(req.user.id); }

  @Get('history')
  getHistory(@Request() req: any) { return this.loyaltyService.getHistory(req.user.id); }
}
