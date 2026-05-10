// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { IsInt, IsPositive, Min } from 'class-validator';

export class AddCartItemDto {
  @IsInt()
  @IsPositive()
  variantId: number;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class UpdateCartItemDto {
  @IsInt()
  @Min(1)
  quantity: number;
}
