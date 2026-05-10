// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class SaveForLaterDto {
  @IsNumber()
  variantId: number;
}

export class CreateDeliverySlotDto {
  @IsDateString()
  date: string;

  @IsString()
  slotLabel: string;

  @IsOptional()
  @IsNumber()
  maxOrders?: number;

  @IsOptional()
  @IsString()
  pincode?: string;
}

export class AddGiftOptionDto {
  @IsNumber()
  orderId: number;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsBoolean()
  wrapping?: boolean;

  @IsOptional()
  @IsString()
  recipientName?: string;
}
