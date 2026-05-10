import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PolicyType } from '@prisma/client';

export class CreatePolicyDto {
  @IsEnum(PolicyType)
  type: PolicyType;

  @IsString()
  version: string;

  @IsString()
  content: string;
}

export class CookieConsentDto {
  @IsOptional()
  @IsBoolean()
  analytics?: boolean;

  @IsOptional()
  @IsBoolean()
  marketing?: boolean;

  @IsOptional()
  @IsString()
  sessionId?: string;
}
