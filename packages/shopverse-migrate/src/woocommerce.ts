// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import type { CsvTable } from './csv';
import type { MapResult, ShopVerseProduct } from './types';
import {
  deriveSizeColor,
  priceToBaseAndDiscount,
  slugify,
  splitList,
  stripHtml,
  toNumber,
} from './normalize';

/** Collect a Woo row's attribute name/value pairs (single chosen value on a
 *  variation; pipe-separated option list on a parent — only used for variations). */
function wooAttributes(row: Record<string, string>): {
  name: string;
  value: string;
}[] {
  const out: { name: string; value: string }[] = [];
  for (let n = 1; n <= 3; n++) {
    const name = row[`Attribute ${n} name`] ?? '';
    const value = row[`Attribute ${n} value(s)`] ?? '';
    if (name || value) out.push({ name, value });
  }
  return out;
}

/** Woo categories are "Parent > Child, Other" — take the first entry's leaf. */
function firstCategory(raw: string): string {
  const first = (raw.split(',')[0] ?? '').trim();
  const parts = first.split('>');
  return (parts[parts.length - 1] ?? first).trim();
}

function effectivePrice(row: Record<string, string>): {
  basePrice: number;
  discountPct: number;
} {
  const regular = toNumber(row['Regular price']);
  const sale = toNumber(row['Sale price']);
  return sale > 0
    ? priceToBaseAndDiscount(sale, regular)
    : priceToBaseAndDiscount(regular, 0);
}

/**
 * Map a WooCommerce product CSV export into ShopVerse products.
 *
 * Woo mixes three row types: `simple` (standalone), `variable` (a parent
 * shell), and `variation` (a child referencing its parent via `Parent` =
 * `id:<ID>`). Pass 1 builds products from simple/variable rows; pass 2 attaches
 * variations to their parent by `ID`. A variable parent's price is taken from
 * its first variation (parents usually leave price blank).
 */
export function fromWoo(table: CsvTable): MapResult {
  const warnings: string[] = [];
  let skipped = 0;

  const products: ShopVerseProduct[] = [];
  const byId = new Map<string, ShopVerseProduct>();

  // ── Pass 1: simple + variable products ──────────────────────────────────────
  for (const row of table.rows) {
    const type = (row['Type'] ?? '').toLowerCase();
    if (type === 'variation') continue;

    const name = row['Name'] ?? '';
    if (!name) {
      skipped++;
      continue;
    }

    const published = (row['Published'] ?? '').toLowerCase();
    const isActive =
      published !== '0' && published !== '-1' && published !== 'false';
    const { basePrice, discountPct } = effectivePrice(row);

    const product: ShopVerseProduct = {
      name,
      slug: slugify(name),
      description: stripHtml(row['Description'] || row['Short description'] || ''),
      brand: row['Brand'] ?? '',
      category: firstCategory(row['Categories'] ?? ''),
      basePrice,
      discountPct,
      images: splitList(row['Images']),
      tags: splitList(row['Tags']),
      isActive,
      variants: [],
    };

    if (type !== 'variable') {
      // Simple product → one default variant (attribute columns hold the option
      // catalogue, not a single chosen value, so we don't expand them here).
      product.variants.push({
        size: 'One Size',
        color: 'Default',
        sku: row['SKU'] || product.slug,
        stock: Math.max(0, Math.trunc(toNumber(row['Stock']))),
      });
    }

    products.push(product);
    const id = row['ID'] ?? '';
    if (id) byId.set(id, product);
  }

  // ── Pass 2: variations → their parent product ───────────────────────────────
  for (const row of table.rows) {
    if ((row['Type'] ?? '').toLowerCase() !== 'variation') continue;

    const parentRef = row['Parent'] ?? '';
    const parentId = parentRef.replace(/^id:/i, '').trim();
    const product = byId.get(parentId);
    if (!product) {
      skipped++;
      warnings.push(
        `Variation "${row['SKU'] || row['Name'] || '(unnamed)'}" references ` +
          `unknown parent "${parentRef}" — skipped.`,
      );
      continue;
    }

    const { size, color } = deriveSizeColor(wooAttributes(row));
    const { basePrice, discountPct } = effectivePrice(row);
    product.variants.push({
      size,
      color,
      sku: row['SKU'] || `${product.slug}-${product.variants.length + 1}`,
      stock: Math.max(0, Math.trunc(toNumber(row['Stock']))),
    });

    // Variable parents usually leave price blank; adopt the first variation's.
    if (product.basePrice === 0 && basePrice > 0) {
      product.basePrice = basePrice;
      product.discountPct = discountPct;
    }
  }

  // A variable parent with no variations is unusable — give it a default variant.
  for (const product of products) {
    if (product.variants.length === 0) {
      warnings.push(
        `"${product.slug}" is a variable product with no variations — ` +
          'added a single default variant.',
      );
      product.variants.push({
        size: 'One Size',
        color: 'Default',
        sku: product.slug,
        stock: 0,
      });
    }
  }

  return { products, warnings, skipped };
}
