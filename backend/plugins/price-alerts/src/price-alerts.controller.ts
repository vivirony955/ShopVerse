// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import type { PriceAlertsService } from './price-alerts.service';

/**
 * Plugin REST controller. The actual NestJS decorators are deliberately
 * absent here — when the kernel's dynamic-controller-attach lands in
 * W2 session 2, this class gets a `@Controller('plugin/price-alerts')`
 * + `@UseGuards(JwtAuthGuard)` shimmed on at register time (so the
 * plugin source has no compile-time dependency on @nestjs/common).
 *
 * `bindService(...)` is the side-channel used until proper DI wiring
 * exists. The kernel calls it after instantiating the service in
 * onRegister; controllers then use the bound instance.
 *
 * Routes (once attached):
 *   POST   /api/plugin/price-alerts        — set/update alert
 *   GET    /api/plugin/price-alerts        — list current user's alerts
 *   DELETE /api/plugin/price-alerts/:id    — remove
 */
export class PriceAlertsController {
  private static service: PriceAlertsService | null = null;

  static bindService(svc: PriceAlertsService): void {
    PriceAlertsController.service = svc;
  }

  private get svc(): PriceAlertsService {
    if (!PriceAlertsController.service) {
      throw new Error(
        'PriceAlertsController used before bindService() — kernel must call ' +
          'bindService during onRegister before attaching routes.',
      );
    }
    return PriceAlertsController.service;
  }

  set(userId: number, dto: { productId: number; targetPrice: number }) {
    return this.svc.set(userId, dto.productId, dto.targetPrice);
  }

  list(userId: number) {
    return this.svc.getForUser(userId);
  }

  delete(userId: number, productId: number) {
    return this.svc.delete(userId, productId);
  }
}
