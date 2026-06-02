// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { BlacklistType, FraudFlagStatus, FraudFlagType } from '@prisma/client';

export class AddBlacklistDto {
  @IsEnum(BlacklistType)
  type: BlacklistType;

  @IsString()
  value: string;

  @IsString()
  reason: string;
}

export class FlagFraudDto {
  @IsOptional()
  @IsNumber()
  userId?: number;

  @IsOptional()
  @IsNumber()
  orderId?: number;

  @IsEnum(FraudFlagType)
  type: FraudFlagType;

  @IsOptional()
  @IsString()
  detail?: string;
}

export class ResolveFlagDto {
  @IsEnum(FraudFlagStatus)
  status: FraudFlagStatus;

  @IsNumber()
  reviewedBy: number;
}
