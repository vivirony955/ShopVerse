// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';

// T-W01 FIX: cap single credit/debit at ₹100,000 — prevents accidental/malicious large operations
const MAX_SINGLE_TRANSACTION = 100_000;

export class CreditWalletDto {
  @IsNumber()
  userId: number;

  @IsNumber()
  @Min(0.01)
  @Max(MAX_SINGLE_TRANSACTION)
  amount: number;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class DebitWalletDto {
  @IsNumber()
  userId: number;

  @IsNumber()
  @Min(0.01)
  @Max(MAX_SINGLE_TRANSACTION)
  amount: number;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class WithdrawDto {
  @IsNumber()
  @Min(0.01)
  @Max(MAX_SINGLE_TRANSACTION)
  amount: number;
}

export class ReconcilePaymentDto {
  @IsString()
  gatewayRef: string;

  @IsNumber()
  gatewayAmount: number;

  @IsOptional()
  @IsNumber()
  orderId?: number;
}
