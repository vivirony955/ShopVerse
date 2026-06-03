// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { calculateSavings } from './savings';

describe('calculateSavings', () => {
  it('Shopify Basic with Shopify Payments → subscription only, no txn fee', () => {
    const r = calculateSavings({ annualGmv: 50_000, platform: 'shopify' });
    expect(r.breakdown.currentSubscription).toBe(39 * 12);
    expect(r.breakdown.currentTransactionFees).toBe(0);
    expect(r.shopverseAnnualCost).toBe(25 * 12);
    expect(r.annualSavings).toBe(39 * 12 - 25 * 12);
    expect(r.overGmvThreshold).toBe(false);
  });

  it('charges the platform transaction fee without Shopify Payments', () => {
    const r = calculateSavings({
      annualGmv: 100_000,
      platform: 'shopify',
      shopifyPlan: 'advanced',
      usesShopifyPayments: false,
    });
    // Advanced: $399/mo + 0.5% of GMV.
    expect(r.breakdown.currentSubscription).toBe(399 * 12);
    expect(r.breakdown.currentTransactionFees).toBe(0.005 * 100_000);
    expect(r.currentAnnualCost).toBe(399 * 12 + 500);
  });

  it('flags GMV over the $100k gate', () => {
    const r = calculateSavings({ annualGmv: 150_000, platform: 'shopify' });
    expect(r.overGmvThreshold).toBe(true);
    expect(r.assumptions.some((a) => a.includes('commercial license'))).toBe(true);
  });

  it('uses the WooCommerce monthly cost', () => {
    const r = calculateSavings({
      annualGmv: 40_000,
      platform: 'woocommerce',
      wooMonthlyCost: 120,
    });
    expect(r.breakdown.currentSubscription).toBe(120 * 12);
    expect(r.breakdown.currentTransactionFees).toBe(0);
  });

  it('computes a savings percentage of the current cost', () => {
    const r = calculateSavings({ annualGmv: 0, platform: 'shopify' });
    const expected = (39 * 12 - 25 * 12) / (39 * 12);
    expect(r.savingsPct).toBeCloseTo(Math.round(expected * 100) / 100, 5);
  });
});
