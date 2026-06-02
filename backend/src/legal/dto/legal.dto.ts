// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

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
