// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * Savings calculator — the "escape platform fees" sales hook.
 *
 * It compares ONLY platform-specific costs (SaaS subscription + the platform's
 * own per-transaction fee) against ShopVerse's cost (self-host infra; $0
 * platform fee under the $100k GMV gate). Card-processing fees (~2.9% + 30¢)
 * are deliberately EXCLUDED — you pay those to a processor on either platform
 * (Stripe on ShopVerse), so they cancel out and including them would inflate
 * the result dishonestly.
 *
 * Every number here is a documented, OVERRIDABLE estimate. Public SaaS pricing
 * changes; the calculator surfaces its assumptions so they can be verified.
 */

export type ShopifyPlan = 'basic' | 'shopify' | 'advanced' | 'plus';

/** Monthly subscription + the EXTRA platform fee charged when NOT using
 *  Shopify Payments (0 when Shopify Payments is used). Estimates, USD. */
export const SHOPIFY_PLANS: Record<
  ShopifyPlan,
  { monthly: number; nonShopifyPaymentsFeePct: number; label: string }
> = {
  basic: { monthly: 39, nonShopifyPaymentsFeePct: 0.02, label: 'Basic' },
  shopify: { monthly: 105, nonShopifyPaymentsFeePct: 0.01, label: 'Shopify' },
  advanced: { monthly: 399, nonShopifyPaymentsFeePct: 0.005, label: 'Advanced' },
  plus: { monthly: 2300, nonShopifyPaymentsFeePct: 0.0015, label: 'Plus' },
};

/** Default monthly all-in cost of a self-managed WooCommerce store (managed
 *  hosting + essential paid plugins). Highly variable; overridable. */
export const DEFAULT_WOO_MONTHLY = 70;

/** Default monthly infra to self-host ShopVerse (small managed Postgres + a
 *  web service on Railway/Render-class hosting). Overridable. */
export const DEFAULT_SHOPVERSE_MONTHLY_INFRA = 25;

/** The BSL Additional-Use-Grant GMV ceiling (USD, trailing 12 months). */
export const GMV_THRESHOLD = 100_000;

export interface SavingsInput {
  /** Annual gross merchandise value (store currency, treated as USD here). */
  annualGmv: number;
  platform: 'shopify' | 'woocommerce';
  /** Shopify only. Defaults to `basic`. */
  shopifyPlan?: ShopifyPlan;
  /** Shopify only. If true (default), the extra platform txn fee is waived. */
  usesShopifyPayments?: boolean;
  /** WooCommerce only. Monthly all-in cost; defaults to DEFAULT_WOO_MONTHLY. */
  wooMonthlyCost?: number;
  /** ShopVerse self-host infra estimate; defaults to DEFAULT_SHOPVERSE_MONTHLY_INFRA. */
  shopverseMonthlyInfra?: number;
}

export interface SavingsResult {
  schema: 'shopverse.savings.v1';
  annualGmv: number;
  currentAnnualCost: number;
  shopverseAnnualCost: number;
  annualSavings: number;
  /** Savings as a fraction of the current platform cost (0..1). */
  savingsPct: number;
  /** True when GMV exceeds the $100k gate → a commercial license applies. */
  overGmvThreshold: boolean;
  breakdown: {
    currentSubscription: number;
    currentTransactionFees: number;
    shopverseInfra: number;
  };
  /** Human-readable list of every estimate used. */
  assumptions: string[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculateSavings(input: SavingsInput): SavingsResult {
  const gmv = Math.max(0, Number.isFinite(input.annualGmv) ? input.annualGmv : 0);
  const shopverseInfra =
    (input.shopverseMonthlyInfra ?? DEFAULT_SHOPVERSE_MONTHLY_INFRA) * 12;
  const assumptions: string[] = [];

  let currentSubscription = 0;
  let currentTransactionFees = 0;

  if (input.platform === 'shopify') {
    const plan = SHOPIFY_PLANS[input.shopifyPlan ?? 'basic'];
    const usesShopifyPayments = input.usesShopifyPayments ?? true;
    currentSubscription = plan.monthly * 12;
    currentTransactionFees = usesShopifyPayments
      ? 0
      : plan.nonShopifyPaymentsFeePct * gmv;

    assumptions.push(
      `Shopify ${plan.label} plan at $${plan.monthly}/mo (estimate — verify current pricing).`,
    );
    assumptions.push(
      usesShopifyPayments
        ? 'Using Shopify Payments → no extra platform transaction fee.'
        : `Not using Shopify Payments → ${(
            plan.nonShopifyPaymentsFeePct * 100
          ).toFixed(2)}% platform transaction fee on GMV.`,
    );
  } else {
    const wooMonthly = input.wooMonthlyCost ?? DEFAULT_WOO_MONTHLY;
    currentSubscription = wooMonthly * 12;
    assumptions.push(
      `WooCommerce all-in hosting + plugins at $${wooMonthly}/mo (estimate — override with your real cost).`,
    );
  }

  assumptions.push(
    `ShopVerse self-host infra at $${
      input.shopverseMonthlyInfra ?? DEFAULT_SHOPVERSE_MONTHLY_INFRA
    }/mo (estimate).`,
  );
  assumptions.push(
    'Card-processing fees excluded — paid to a processor on either platform, so they cancel out.',
  );

  const overGmvThreshold = gmv > GMV_THRESHOLD;
  if (overGmvThreshold) {
    assumptions.push(
      `GMV exceeds the $${GMV_THRESHOLD.toLocaleString(
        'en-US',
      )} gate — a ShopVerse commercial license applies (not priced in here).`,
    );
  } else {
    assumptions.push(
      `GMV is under the $${GMV_THRESHOLD.toLocaleString(
        'en-US',
      )} gate — ShopVerse platform fee is $0.`,
    );
  }

  const currentAnnualCost = round2(currentSubscription + currentTransactionFees);
  const shopverseAnnualCost = round2(shopverseInfra);
  const annualSavings = round2(currentAnnualCost - shopverseAnnualCost);
  const savingsPct =
    currentAnnualCost > 0 ? round2(annualSavings / currentAnnualCost) : 0;

  return {
    schema: 'shopverse.savings.v1',
    annualGmv: gmv,
    currentAnnualCost,
    shopverseAnnualCost,
    annualSavings,
    savingsPct,
    overGmvThreshold,
    breakdown: {
      currentSubscription: round2(currentSubscription),
      currentTransactionFees: round2(currentTransactionFees),
      shopverseInfra: round2(shopverseInfra),
    },
    assumptions,
  };
}
