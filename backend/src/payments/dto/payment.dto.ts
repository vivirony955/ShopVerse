import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class CreatePaymentIntentDto {
  @IsInt()
  @IsPositive()
  orderId: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;
}
