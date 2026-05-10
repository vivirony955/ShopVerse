// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreatePaymentIntentDto {
  @IsInt()
  @IsPositive()
  orderId: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;
}
