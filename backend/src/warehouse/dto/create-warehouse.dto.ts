// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  name: string;

  @IsString()
  code: string;

  @IsString()
  city: string;

  @IsString()
  state: string;

  @IsString()
  pincode: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;
}

export class UpdateInventoryDto {
  @IsNumber()
  warehouseId: number;

  @IsNumber()
  variantId: number;

  @IsNumber()
  stock: number;
}

export class RouteOrderDto {
  @IsNumber()
  orderId: number;

  @IsString()
  deliveryPincode: string;
}
