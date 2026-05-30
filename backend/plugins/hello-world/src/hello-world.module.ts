// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { HookRunner } from '../../../src/common/hook-runner.service';
import { EventBus } from '../../../src/common/event-bus.service';

const PLUGIN_ID = '@shopverse/plugin-hello-world';

/**
 * Tutorial plugin (W6.T10). Exercises every contract type:
 *
 *   - sync hook: cart.beforeReserve (observation only — never rejects)
 *   - async event: order.placed (logs the order)
 *   - frontend slot: pdp.afterDescription (wired in
 *     frontend/src/plugins/hello-world/, registered via
 *     frontend/src/generated/slot-registrations.ts)
 *
 * No Prisma model, no cron, no strategy — those are documented as
 * "next steps" in docs/plugins/tutorial.md. The minimal-viable
 * plugin demonstrates the boot path without any kernel-state
 * coupling.
 *
 * Operator-side test: flip `enabled: false` for this entry in
 * `backend/plugins.config.ts`, rebuild, restart. The PDP shows no
 * hello-world greeting; orders still place fine. That's the plugin
 * contract working.
 */
@Injectable()
class HelloWorldBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger('HelloWorld');

  constructor(
    private readonly hooks: HookRunner,
    private readonly eventBus: EventBus,
  ) {}

  onApplicationBootstrap(): void {
    this.hooks.register('cart.beforeReserve', PLUGIN_ID, async (ctx) => {
      if (ctx.cart.items.length === 0) return undefined;
      this.logger.log(
        `cart.beforeReserve fired for user ${ctx.userId} (${ctx.cart.items.length} items)`,
      );
      return undefined; // observation only — never rejects
    });

    this.eventBus.subscribe('order.placed', PLUGIN_ID, async (event) => {
      this.logger.log(
        `order.placed received: order #${event.orderId} (user ${event.userId ?? 'guest'}, total ${event.total})`,
      );
    });
  }
}

@Module({
  providers: [HelloWorldBootstrap],
})
export class HelloWorldPluginModule {}
