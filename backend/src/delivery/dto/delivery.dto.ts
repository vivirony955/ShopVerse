// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import {
  IsString,
  Length,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
} from 'class-validator';

export class CheckDeliveryDto {
  @IsString()
  @Length(2, 12, { message: 'Postal code must be 2–12 characters' })
  pincode: string;

  // ISO 3166-1 alpha-2; defaults to the store's configured country when omitted.
  @IsOptional()
  @IsString()
  country?: string;
}

export class UpsertPincodeDto {
  @IsString()
  @Length(2, 12)
  pincode: string;

  @IsOptional()
  @IsString()
  country?: string;

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
