// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * The normalized, platform-neutral shapes the importer emits. They mirror the
 * ShopVerse `Product` / `Variant` models, but carry brand/category by NAME
 * (the consumer resolves or creates the FK rows) and collapse per-variant
 * pricing to ShopVerse's product-level `basePrice` + `discountPct` (ShopVerse
 * variants distinguish size/color/sku/stock, not price).
 */

export interface ShopVerseVariant {
  size: string;
  color: string;
  sku: string;
  stock: number;
}

export interface ShopVerseProduct {
  name: string;
  slug: string;
  description: string;
  /** Brand/vendor name — consumer maps to a `brandId`. */
  brand: string;
  /** Category name — consumer maps to a `categoryId`. */
  category: string;
  /** Product-level list price (the "compare-at"/regular price when on sale). */
  basePrice: number;
  /** 0..100; derived from a sale/compare-at price when present. */
  discountPct: number;
  images: string[];
  tags: string[];
  isActive: boolean;
  variants: ShopVerseVariant[];
}

export type SourcePlatform = 'shopify' | 'woocommerce';

export interface ImportStats {
  /** Data rows read (excludes the header). */
  rows: number;
  products: number;
  variants: number;
  /** Rows that could not be turned into a product/variant. */
  skipped: number;
}

export interface ImportResult {
  schema: 'shopverse.import.v1';
  source: SourcePlatform;
  generatedAt: string;
  products: ShopVerseProduct[];
  stats: ImportStats;
  /** Non-fatal issues an operator should review (lossy mappings, etc.). */
  warnings: string[];
}

/** Internal mapper return shape (before stats/envelope are added). */
export interface MapResult {
  products: ShopVerseProduct[];
  warnings: string[];
  skipped: number;
}
