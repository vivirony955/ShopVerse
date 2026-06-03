// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

export { parseCsv, parseCsvTable } from './csv';
export type { CsvTable } from './csv';
export { importProducts, detectPlatform } from './import';
export type { ImportOptions } from './import';
export { fromShopify } from './shopify';
export { fromWoo } from './woocommerce';
export {
  calculateSavings,
  SHOPIFY_PLANS,
  GMV_THRESHOLD,
  DEFAULT_WOO_MONTHLY,
  DEFAULT_SHOPVERSE_MONTHLY_INFRA,
} from './savings';
export type { ShopifyPlan, SavingsInput, SavingsResult } from './savings';
export type {
  ShopVerseProduct,
  ShopVerseVariant,
  SourcePlatform,
  ImportResult,
  ImportStats,
  MapResult,
} from './types';
