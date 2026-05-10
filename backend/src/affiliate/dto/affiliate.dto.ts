// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { IsNumber, IsOptional, IsString } from 'class-validator';
import { AttributionType } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class CreateAffiliateDto {
  @IsNumber()
  userId: number;

  @IsOptional()
  @IsNumber()
  commissionPct?: number;
}

export class TrackAttributionDto {
  @IsOptional()
  @IsString()
  affiliateCode?: string;

  @IsOptional()
  @IsNumber()
  orderId?: number;

  @IsOptional()
  @IsString()
  utmSource?: string;

  @IsOptional()
  @IsString()
  utmMedium?: string;

  @IsOptional()
  @IsString()
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  utmContent?: string;

  @IsOptional()
  @IsEnum(AttributionType)
  attributionType?: AttributionType;
}
