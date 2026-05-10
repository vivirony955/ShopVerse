import { Module } from '@nestjs/common';
import { QaService } from './qa.service';
import { QaController } from './qa.controller';

@Module({
  providers: [QaService],
  controllers: [QaController],
})
export class QaModule {}
