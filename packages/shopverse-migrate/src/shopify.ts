// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import type { CsvTable } from './csv';
import type { MapResult, ShopVerseProduct, ShopVerseVariant } from './types';
import {
  deriveSizeColor,
  priceToBaseAndDiscount,
  splitList,
  stripHtml,
  toNumber,
  unique,
} from './normalize';

/**
 * Map a Shopify `products_export.csv` into ShopVerse products.
 *
 * Shopify emits ONE ROW PER VARIANT; product-level fields (Title, Body,
 * Vendor, Tags) appear only on the first row of a `Handle` and are blank on
 * subsequent rows, and extra image rows may carry only `Image Src`. So we
 * group by Handle, take product fields from the first populated row, and
 * collect variants + images across the group.
 */
export function fromShopify(table: CsvTable): MapResult {
  const warnings: string[] = [];
  let skipped = 0;

  // Preserve first-seen order of handles.
  const order: string[] = [];
  const groups = new Map<string, Record<string, string>[]>();
  for (const row of table.rows) {
    const handle = row['Handle'] ?? '';
    if (!handle) {
      skipped++;
      continue;
    }
    let group = groups.get(handle);
    if (!group) {
      group = [];
      groups.set(handle, group);
      order.push(handle);
    }
    group.push(row);
  }

  const products: ShopVerseProduct[] = [];

  for (const handle of order) {
    const rows = groups.get(handle) ?? [];
    const titleRow = rows.find((r) => (r['Title'] ?? '') !== '') ?? rows[0];

    const name = titleRow['Title'] || handle;
    const description = stripHtml(titleRow['Body (HTML)'] ?? '');
    const brand = titleRow['Vendor'] ?? '';
    const category = titleRow['Product Category'] || titleRow['Type'] || '';
    const tags = splitList(titleRow['Tags']);
    const published = (titleRow['Published'] ?? '').toLowerCase();
    const isActive =
      published !== 'false' && published !== 'no' && published !== '0';
    const images = unique(
      rows.map((r) => r['Image Src'] ?? '').filter((s) => s.length > 0),
    );

    const variants: ShopVerseVariant[] = [];
    const prices: { base: number; disc: number }[] = [];

    rows.forEach((r, idx) => {
      const hasVariant =
        (r['Variant SKU'] ?? '') !== '' ||
        (r['Variant Price'] ?? '') !== '' ||
        (r['Option1 Value'] ?? '') !== '';
      if (!hasVariant) return;

      const { size, color } = deriveSizeColor([
        { name: r['Option1 Name'] ?? '', value: r['Option1 Value'] ?? '' },
        { name: r['Option2 Name'] ?? '', value: r['Option2 Value'] ?? '' },
        { name: r['Option3 Name'] ?? '', value: r['Option3 Value'] ?? '' },
      ]);
      const { basePrice, discountPct } = priceToBaseAndDiscount(
        toNumber(r['Variant Price']),
        toNumber(r['Variant Compare At Price']),
      );
      const sku = r['Variant SKU'] || `${handle}-${idx + 1}`;
      const stock = Math.max(0, Math.trunc(toNumber(r['Variant Inventory Qty'])));

      variants.push({ size, color, sku, stock });
      prices.push({ base: basePrice, disc: discountPct });
    });

    if (variants.length === 0) {
      skipped++;
      warnings.push(`"${handle}" has no variants — skipped.`);
      continue;
    }

    const base = prices[0].base;
    const disc = prices[0].disc;
    if (prices.some((p) => p.base !== base || p.disc !== disc)) {
      warnings.push(
        `"${handle}" has variants priced differently; ShopVerse uses one price ` +
          `per product — used the first variant ($${base}, ${disc}% off).`,
      );
    }

    products.push({
      name,
      slug: handle,
      description,
      brand,
      category,
      basePrice: base,
      discountPct: disc,
      images,
      tags,
      isActive,
      variants,
    });
  }

  return { products, warnings, skipped };
}
