import { Global, Module } from '@nestjs/common';
import { AbandonedCartService } from './abandoned-cart.service';

@Global()
@Module({
  providers: [AbandonedCartService],
  exports: [AbandonedCartService],
})
export class AbandonedCartModule {}
