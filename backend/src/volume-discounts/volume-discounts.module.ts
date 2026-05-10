import { Module } from '@nestjs/common';
import { VolumeDiscountsService } from './volume-discounts.service';
import { VolumeDiscountsController } from './volume-discounts.controller';

@Module({
  providers: [VolumeDiscountsService],
  controllers: [VolumeDiscountsController],
  exports: [VolumeDiscountsService],
})
export class VolumeDiscountsModule {}
