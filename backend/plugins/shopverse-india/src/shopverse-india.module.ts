// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import {
  Injectable,
  Logger,
  Module,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { PluginStrategyRegistry } from '../../../src/common/plugin-strategy.registry';
import type { TaxStrategy } from '@shopverse/sdk';

const PLUGIN_ID = '@shopverse/plugin-india';

// Flat GST. Category-based GST (0/5/12/18/28%) + CGST/SGST split are roadmap.
const GST_RATE = 0.18;

const indiaTaxStrategy: TaxStrategy = {
  meta: { id: 'india-gst', mode: 'single' },
  compute({ taxableAmount }) {
    const amount = Math.round(taxableAmount * GST_RATE * 100) / 100;
    return Promise.resolve({ amount, rate: GST_RATE });
  },
};

/**
 * shopverse-india — India region pack.
 *
 * Registers a flat-GST TaxStrategy (18%), moving India's tax knowledge out of
 * the kernel into a swappable pack. A fresh global store ships without this
 * entry (orders fall back to StoreSettings.taxRate); an India operator enables
 * it in backend/plugins.config.ts.
 *
 * Roadmap: category-based GST, CGST/SGST breakdown, FY-invoice
 * InvoiceFormatStrategy, pincode serviceability seed.
 */
@Injectable()
class ShopverseIndiaBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger('ShopverseIndia');

  constructor(private readonly strategies: PluginStrategyRegistry) {}

  onApplicationBootstrap(): void {
    this.strategies.register('TaxStrategy', PLUGIN_ID, indiaTaxStrategy);
    this.logger.log(`Registered India GST TaxStrategy (${GST_RATE * 100}%)`);
  }
}

@Module({
  providers: [ShopverseIndiaBootstrap],
})
export class ShopverseIndiaPluginModule {}
