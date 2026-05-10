import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FraudService } from './fraud.service';
import { AddBlacklistDto, FlagFraudDto, ResolveFlagDto } from './dto/fraud.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Role, Roles } from '../auth/roles.decorator';
import { BlacklistType } from '@prisma/client';

@Controller('fraud')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class FraudController {
  constructor(private readonly svc: FraudService) {}

  @Post('blacklist')
  addBlacklist(@Body() dto: AddBlacklistDto) {
    return this.svc.addToBlacklist(dto);
  }

  @Get('blacklist')
  getBlacklist(@Query('type') type?: BlacklistType) {
    return this.svc.getBlacklist(type);
  }

  @Post('flag')
  flag(@Body() dto: FlagFraudDto) {
    return this.svc.flagFraud(dto);
  }

  @Get('flags')
  openFlags() {
    return this.svc.getOpenFlags();
  }

  @Patch('flags/:id/resolve')
  resolve(@Param('id', ParseIntPipe) id: number, @Body() dto: ResolveFlagDto) {
    return this.svc.resolveFlag(id, dto);
  }

  @Get('risk/:userId')
  riskScore(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getUserRiskScore(userId);
  }

  // H2-05: recompute is CPU-heavy — limit to 5 calls/min per admin (T-F03 fix)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('risk/:userId/recompute')
  recompute(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.computeRiskScore(userId);
  }
}
