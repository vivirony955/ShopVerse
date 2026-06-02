// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
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
