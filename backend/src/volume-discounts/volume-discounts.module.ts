// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Module } from '@nestjs/common';
import { VolumeDiscountsService } from './volume-discounts.service';
import { VolumeDiscountsController } from './volume-discounts.controller';

@Module({
  providers: [VolumeDiscountsService],
  controllers: [VolumeDiscountsController],
  exports: [VolumeDiscountsService],
})
export class VolumeDiscountsModule {}
