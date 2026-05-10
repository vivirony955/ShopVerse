// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  IsString,
  IsIn,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsDateString,
  MaxLength,
  IsPositive,
  ValidateIf,
} from 'class-validator';

export class ValidateCouponDto {
  @IsString()
  @MaxLength(50)
  code: string;

  @IsNumber()
  @Min(0)
  orderAmount: number;
}

export class CreateCouponDto {
  @IsString()
  @MaxLength(50)
  code: string;

  @IsIn(['PERCENTAGE', 'FIXED'])
  discountType: 'PERCENTAGE' | 'FIXED';

  @IsNumber()
  @Min(0)
  // T-C03 FIX: cap PERCENTAGE at 100 — FIXED has no upper cap (large FIXED discounts are intentional)
  @ValidateIf((o) => o.discountType === 'PERCENTAGE')
  @Max(100)
  discountValue: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  maxUses?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateCouponDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsIn(['PERCENTAGE', 'FIXED'])
  discountType?: 'PERCENTAGE' | 'FIXED';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @ValidateIf((o) => o.discountType === 'PERCENTAGE')
  @Max(100)
  discountValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  maxUses?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
