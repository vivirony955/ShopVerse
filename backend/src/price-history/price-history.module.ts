import { Module } from '@nestjs/common';
import { PriceHistoryService } from './price-history.service';
import { PriceHistoryController } from './price-history.controller';

@Module({
  providers: [PriceHistoryService],
  controllers: [PriceHistoryController],
  exports: [PriceHistoryService],
})
export class PriceHistoryModule {}
