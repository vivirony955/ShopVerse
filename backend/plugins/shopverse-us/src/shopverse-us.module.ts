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

const PLUGIN_ID = '@shopverse/plugin-us';

// Combined average state sales-tax rates (starter table). Production deployments
// should swap this for a Stripe Tax / TaxJar adapter — see roadmap. Keys are
// USPS 2-letter codes (uppercased); states with no statewide sales tax are 0.
const US_STATE_TAX: Readonly<Record<string, number>> = {
  AL: 0.04, AZ: 0.056, AR: 0.065, CA: 0.0725, CO: 0.029, CT: 0.0635,
  DC: 0.06, FL: 0.06, GA: 0.04, HI: 0.04, ID: 0.06, IL: 0.0625,
  IN: 0.07, IA: 0.06, KS: 0.065, KY: 0.06, LA: 0.0445, ME: 0.055,
  MD: 0.06, MA: 0.0625, MI: 0.06, MN: 0.06875, MS: 0.07, MO: 0.04225,
  NE: 0.055, NV: 0.0685, NJ: 0.06625, NM: 0.05125, NY: 0.04, NC: 0.0475,
  ND: 0.05, OH: 0.0575, OK: 0.045, PA: 0.06, RI: 0.07, SC: 0.06,
  SD: 0.045, TN: 0.07, TX: 0.0625, UT: 0.0485, VT: 0.06, VA: 0.053,
  WA: 0.065, WV: 0.06, WI: 0.05, WY: 0.04,
  // No statewide sales tax:
  AK: 0, DE: 0, MT: 0, NH: 0, OR: 0,
};

// Fallback when the destination state is unknown or missing (e.g. guest orders
// that pass a null address). Roughly the US median combined rate.
const DEFAULT_US_RATE = 0.06;

/**
 * Destination-based US sales tax. Keyed on the shipping address's state code;
 * this is where a TaxStrategy earns its keep over a flat StoreSettings.taxRate.
 */
export const usTaxStrategy: TaxStrategy = {
  meta: { id: 'us-sales-tax', mode: 'single' },
  compute({ taxableAmount, shippingAddress }) {
    const state = (shippingAddress?.state ?? '').trim().toUpperCase();
    const rate = state in US_STATE_TAX ? US_STATE_TAX[state] : DEFAULT_US_RATE;
    const amount = Math.round(taxableAmount * rate * 100) / 100;
    return Promise.resolve({
      amount,
      rate,
      breakdown: state ? { [`US-${state}`]: amount } : undefined,
    });
  },
};

/**
 * shopverse-us — United States region pack.
 *
 * Registers the destination-based sales-tax TaxStrategy above. Disabled by
 * default — enable in backend/plugins.config.ts for US deployments (and disable
 * any other region pack, since TaxStrategy is single-mode and a second
 * registration would conflict).
 *
 * Roadmap: Stripe Tax / TaxJar adapter (live rates + nexus), US address +
 * ZIP+4 validation, EU VAT sibling pack.
 */
@Injectable()
class ShopverseUsBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger('ShopverseUs');

  constructor(private readonly strategies: PluginStrategyRegistry) {}

  onApplicationBootstrap(): void {
    this.strategies.register('TaxStrategy', PLUGIN_ID, usTaxStrategy);
    this.logger.log('Registered US sales-tax TaxStrategy (per-state)');
  }
}

@Module({
  providers: [ShopverseUsBootstrap],
})
export class ShopverseUsPluginModule {}
