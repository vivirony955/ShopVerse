import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

class ApplyReferralDto { @IsString() code: string; }

@Controller('referral')
@UseGuards(JwtAuthGuard)
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Get('my-code')
  getMyCode(@Request() req: any) { return this.referralService.getMyCode(req.user.userId); }

  @Post('apply')
  apply(@Request() req: any, @Body() dto: ApplyReferralDto) {
    return this.referralService.applyReferral(req.user.userId, dto.code);
  }
}
