import { Module } from '@nestjs/common';
import { ExchangeService } from './exchange.service';
import { ExchangeController } from './exchange.controller';

@Module({
  providers: [ExchangeService],
  controllers: [ExchangeController],
})
export class ExchangeModule {}
