// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { IsInt, IsPositive, IsOptional, IsString, MaxLength, IsIn, IsEmail, ValidateNested, IsArray, ArrayMinSize, Matches, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PlaceOrderDto {
  @IsInt()
  @IsPositive()
  addressId: number;

  // FINAL §4.2: mandatory reservationId obtained from POST /cart/reserve.
  @IsInt()
  @IsPositive()
  reservationId: number;

  // H2-09: whitelist coupon format — alphanumeric + hyphen/underscore only, max 50 chars.
  // Prevents injection attempts and trivially invalid codes reaching the DB.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_-]+$/i, { message: 'couponCode must contain only letters, numbers, hyphens, and underscores' })
  couponCode?: string;

  // F1-15: wallet amount to apply toward this order (server-side clamp to min(balance, total))
  @IsOptional()
  @IsNumber()
  @Min(0)
  walletAmountUsed?: number;
}

export class UpdateOrderStatusDto {
  @IsString()
  @IsIn(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURN_REQUESTED', 'RETURNED', 'REFUNDED'])
  status: string;
}

export class GuestOrderItemDto {
  @IsInt()
  @IsPositive()
  variantId: number;

  @IsInt()
  @IsPositive()
  quantity: number;
}

export class GuestAddressDto {
  @IsString()
  fullName: string;

  @IsString()
  line1: string;

  @IsOptional()
  @IsString()
  line2?: string;

  @IsString()
  city: string;

  @IsString()
  state: string;

  @IsString()
  pincode: string;

  @IsString()
  country: string;

  @IsString()
  phone: string;
}

export class PlaceGuestOrderDto {
  @IsEmail()
  email: string;

  @ValidateNested()
  @Type(() => GuestAddressDto)
  address: GuestAddressDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GuestOrderItemDto)
  items: GuestOrderItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_-]+$/i, { message: 'couponCode must contain only letters, numbers, hyphens, and underscores' })
  couponCode?: string;
}
