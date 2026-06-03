// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { parseCsvTable } from './csv';
import type { CsvTable } from './csv';
import type { ImportResult, SourcePlatform } from './types';
import { fromShopify } from './shopify';
import { fromWoo } from './woocommerce';

/** Detect the source platform from a CSV's header row. */
export function detectPlatform(headers: string[]): SourcePlatform {
  if (headers.includes('Handle')) return 'shopify';
  if (headers.includes('Regular price') || headers.includes('In stock?')) {
    return 'woocommerce';
  }
  throw new Error(
    'Could not detect the source platform from the CSV headers. Pass it ' +
      'explicitly with --platform=shopify|woocommerce.\n' +
      `Headers seen: ${headers.slice(0, 12).join(', ')}${
        headers.length > 12 ? ', …' : ''
      }`,
  );
}

export interface ImportOptions {
  /** Force a platform instead of auto-detecting from headers. */
  platform?: SourcePlatform;
}

/**
 * Parse a Shopify / WooCommerce product-export CSV into a normalized,
 * ShopVerse-ingestable `ImportResult` (products + stats + warnings).
 */
export function importProducts(csv: string, options: ImportOptions = {}): ImportResult {
  const table: CsvTable = parseCsvTable(csv);
  const platform = options.platform ?? detectPlatform(table.headers);
  const mapped = platform === 'shopify' ? fromShopify(table) : fromWoo(table);

  const variants = mapped.products.reduce((n, p) => n + p.variants.length, 0);

  return {
    schema: 'shopverse.import.v1',
    source: platform,
    generatedAt: new Date().toISOString(),
    products: mapped.products,
    stats: {
      rows: table.rows.length,
      products: mapped.products.length,
      variants,
      skipped: mapped.skipped,
    },
    warnings: mapped.warnings,
  };
}
