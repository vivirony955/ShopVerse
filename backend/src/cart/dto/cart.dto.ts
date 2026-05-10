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
