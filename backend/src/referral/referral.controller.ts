// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ReferralService } from './referral.service';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types';

class ApplyReferralDto {
  @IsString() code: string;
}

@Controller('referral')
@UseGuards(JwtAuthGuard)
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Get('my-code')
  getMyCode(@Request() req: AuthenticatedRequest) {
    return this.referralService.getMyCode(req.user.id);
  }

  @Post('apply')
  @HttpCode(200)
  apply(@Request() req: AuthenticatedRequest, @Body() dto: ApplyReferralDto) {
    return this.referralService.applyReferral(req.user.id, dto.code);
  }
}
