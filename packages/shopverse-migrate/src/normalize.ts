// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/** Shared field-normalization helpers used by both platform mappers. */

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Parse a possibly messy numeric cell ("$19.99", "1,299.00", "") → number. */
export function toNumber(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.\-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Slugify a product name (WooCommerce has no handle; Shopify supplies one). */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Strip HTML tags + collapse whitespace; decode the handful of common entities. */
export function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split a comma-separated cell (tags, image lists) into trimmed, non-empty parts. */
export function splitList(input: string | undefined): string[] {
  if (!input) return [];
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function unique(items: string[]): string[] {
  return Array.from(new Set(items));
}

/**
 * Map ordered option/attribute pairs to ShopVerse's (size, color). Recognizes
 * the option NAME ("Size", "Colour", …); anything unrecognized falls back to
 * positional order. Empty/placeholder values ("Default Title") are ignored.
 */
export function deriveSizeColor(
  options: { name: string; value: string }[],
): { size: string; color: string } {
  let size = '';
  let color = '';
  const rest: string[] = [];

  for (const opt of options) {
    const name = opt.name.toLowerCase();
    const value = opt.value.trim();
    if (!value || value.toLowerCase() === 'default title') continue;
    if (!size && /size/.test(name)) {
      size = value;
      continue;
    }
    if (!color && /colou?r/.test(name)) {
      color = value;
      continue;
    }
    rest.push(value);
  }

  if (!size && rest.length > 0) {
    size = rest[0];
    rest.splice(0, 1);
  }
  if (!color && rest.length > 0) {
    color = rest[0];
    rest.splice(0, 1);
  }

  return { size: size || 'One Size', color: color || 'Default' };
}

/**
 * Collapse a sale price + list price to ShopVerse's product-level basePrice +
 * discountPct. When on sale, basePrice is the (higher) list price so that
 * basePrice * (1 - discountPct/100) ≈ the effective price.
 */
export function priceToBaseAndDiscount(
  effectivePrice: number,
  listPrice: number,
): { basePrice: number; discountPct: number } {
  const eff = Math.max(0, effectivePrice);
  if (listPrice > 0 && listPrice > eff) {
    const discountPct = Math.round(((listPrice - eff) / listPrice) * 100);
    return { basePrice: round2(listPrice), discountPct };
  }
  return { basePrice: round2(eff), discountPct: 0 };
}
