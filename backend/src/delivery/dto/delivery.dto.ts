import { IsString, Length, IsOptional, IsBoolean, IsInt, Min } from 'class-validator';

export class CheckDeliveryDto {
  @IsString()
  @Length(6, 6, { message: 'Pincode must be exactly 6 digits' })
  pincode: string;
}

export class UpsertPincodeDto {
  @IsString()
  @Length(6, 6)
  pincode: string;

  @IsOptional()
  @IsBoolean()
  isServiceable?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  estimateDays?: number;

  @IsOptional()
  @IsString()
  courier?: string;
}
