// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { recordPluginQuery } from '../common/plugin-context';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    // Plan §5 rule #5 — per-context Prisma query counter (W1.T11).
    // The middleware runs on EVERY operation; recordPluginQuery is a
    // no-op when not inside a plugin context (kernel-originated query),
    // and throws PluginQueryBudgetExceededError when a sync hook
    // exceeds its 1-query budget. Letting the throw propagate aborts
    // the offending Prisma call before it hits the DB.

    // Prisma's middleware: count the query, then pass through. recordPluginQuery
    // throws PluginQueryBudgetExceededError when the active plugin context
    // (set by HookRunner via runInPluginContext) has exceeded its budget;
    // the throw propagates out of `next(params)` and aborts the offending op.
    this.$use((params, next) => {
      recordPluginQuery();
      return next(params);
    });
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
