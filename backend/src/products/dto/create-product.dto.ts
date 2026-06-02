// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsBoolean,
  IsObject,
  Min,
  Max,
  MaxLength,
  IsInt,
  IsPositive,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsString()
  @MaxLength(200)
  slug: string;

  @IsString()
  @MaxLength(5000)
  description: string;

  @IsInt()
  @IsPositive()
  brandId: number;

  @IsInt()
  @IsPositive()
  categoryId: number;

  @IsNumber()
  @Min(0)
  basePrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPct?: number;

  @IsArray()
  @IsString({ each: true })
  images: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  // F1-07: structured specifications (key-value pairs, e.g. { Material: "Cotton", Weight: "200g" })
  @IsOptional()
  @IsObject()
  specifications?: Record<string, string>;

  // F1-10: product video URLs
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  videos?: string[];
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  brandId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  categoryId?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  basePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPct?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // F1-07
  @IsOptional()
  @IsObject()
  specifications?: Record<string, string>;

  // F1-10
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  videos?: string[];
}

export class CreateVariantDto {
  @IsString()
  @MaxLength(50)
  size: string;

  @IsString()
  @MaxLength(50)
  color: string;

  @IsInt()
  @Min(0)
  stock: number;

  @IsString()
  @MaxLength(100)
  sku: string;
}

export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  size?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;
}
