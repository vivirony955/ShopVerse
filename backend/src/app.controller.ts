// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

// Health-check endpoint — used by load balancers / Docker HEALTHCHECK
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('System')
@Controller()
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
