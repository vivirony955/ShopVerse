// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Module } from '@nestjs/common';
import { QaService } from './qa.service';
import { QaController } from './qa.controller';

@Module({
  providers: [QaService],
  controllers: [QaController],
})
export class QaModule {}
