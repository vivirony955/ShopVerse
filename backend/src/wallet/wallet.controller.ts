// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import {
  CreditWalletDto,
  DebitWalletDto,
  ReconcilePaymentDto,
  WithdrawDto,
} from './dto/wallet.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Role, Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../common/types';

@ApiTags('Wallet')
@ApiBearerAuth('JWT')
@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly svc: WalletService) {}

  @Get('me')
  getMyWallet(@CurrentUser() user: AuthUser) {
    return this.svc.getWallet(user.id);
  }

  @Get('me/transactions')
  myTransactions(@CurrentUser() user: AuthUser) {
    return this.svc.getTransactionHistory(user.id);
  }

  @Post('withdraw')
  withdraw(@CurrentUser() user: AuthUser, @Body() dto: WithdrawDto) {
    return this.svc.withdraw(user.id, dto.amount);
  }

  // Admin routes
  // H2-06: admin credits must supply a deterministic reference for idempotency (GAP-ID01)
  @Post('credit')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  credit(@Body() dto: CreditWalletDto) {
    if (!dto.reference) {
      throw new BadRequestException(
        'reference is required for admin wallet credits. ' +
          'Use format: admin:credit:<reason>:<YYYYMMDD>',
      );
    }
    return this.svc.credit(dto);
  }

  @Post('debit')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  debit(@Body() dto: DebitWalletDto) {
    return this.svc.debit(dto);
  }

  @Post('reconcile')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  reconcile(@Body() dto: ReconcilePaymentDto) {
    return this.svc.recordGatewayPayment(dto);
  }

  @Get('reconciliation/report')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  reconciliationReport(@Query('from') from: string, @Query('to') to: string) {
    return this.svc.getReconciliationReport(new Date(from), new Date(to));
  }

  @Get('ledger')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  ledger(@Query('from') from: string, @Query('to') to: string) {
    return this.svc.getLedger(new Date(from), new Date(to));
  }

  /** Delivery agent or admin confirms COD payment received */
  @Patch('cod/:orderId/confirm')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  confirmCOD(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body('note') note?: string,
  ) {
    return this.svc.confirmCODDelivery(orderId, note);
  }
}
