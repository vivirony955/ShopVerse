// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Global, Module } from '@nestjs/common';
import { AbandonedCartService } from './abandoned-cart.service';

@Global()
@Module({
  providers: [AbandonedCartService],
  exports: [AbandonedCartService],
})
export class AbandonedCartModule {}
