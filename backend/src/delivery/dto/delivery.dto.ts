// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { IsString, Length, IsOptional, IsBoolean, IsInt, Min } from 'class-validator';

export class CheckDeliveryDto {
  @IsString()
  @Length(6, 6, { message: 'Pincode must be exactly 6 digits' })
  pincode: string;
}

export class UpsertPincodeDto {
  @IsString()
  @Length(6, 6)
  pincode: string;

  @IsOptional()
  @IsBoolean()
  isServiceable?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  estimateDays?: number;

  @IsOptional()
  @IsString()
  courier?: string;
}
