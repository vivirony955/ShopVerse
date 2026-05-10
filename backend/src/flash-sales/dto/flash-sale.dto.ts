import { IsString, IsNumber, IsDateString, IsOptional, Min, Max } from 'class-validator';

export class CreateFlashSaleDto {
  @IsString()
  title: string;

  @IsString()
  slug: string;

  @IsNumber()
  @Min(1)
  @Max(90)
  discountPct: number;

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;
}

export class UpdateFlashSaleDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsNumber() @Min(1) @Max(90) discountPct?: number;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
}

export class AddFlashSaleProductDto {
  @IsNumber()
  productId: number;
}
