// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Module } from '@nestjs/common';
import { ExchangeService } from './exchange.service';
import { ExchangeController } from './exchange.controller';

@Module({
  providers: [ExchangeService],
  controllers: [ExchangeController],
})
export class ExchangeModule {}
