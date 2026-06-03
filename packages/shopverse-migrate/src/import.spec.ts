// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { detectPlatform, importProducts } from './import';

describe('detectPlatform', () => {
  it('detects Shopify by the Handle column', () => {
    expect(detectPlatform(['Handle', 'Title', 'Variant SKU'])).toBe('shopify');
  });

  it('detects WooCommerce by Regular price / In stock?', () => {
    expect(detectPlatform(['Type', 'Name', 'Regular price'])).toBe('woocommerce');
    expect(detectPlatform(['Name', 'In stock?'])).toBe('woocommerce');
  });

  it('throws with a helpful message when undetectable', () => {
    expect(() => detectPlatform(['foo', 'bar'])).toThrow(/Could not detect/);
  });
});

describe('importProducts', () => {
  const SHOPIFY =
    'Handle,Title,Vendor,Option1 Name,Option1 Value,Variant SKU,Variant Price,Variant Inventory Qty\n' +
    'tee,Tee,Acme,Size,S,TEE-S,10.00,3\n' +
    'tee,,,Size,M,TEE-M,10.00,4';

  it('wraps the result with schema, source, and stats', () => {
    const result = importProducts(SHOPIFY);
    expect(result.schema).toBe('shopverse.import.v1');
    expect(result.source).toBe('shopify');
    expect(result.stats.products).toBe(1);
    expect(result.stats.variants).toBe(2);
    expect(typeof result.generatedAt).toBe('string');
  });

  it('honours an explicit platform override', () => {
    const woo = 'Type,SKU,Name,Regular price,Stock\nsimple,A,Widget,5.00,2';
    const result = importProducts(woo, { platform: 'woocommerce' });
    expect(result.source).toBe('woocommerce');
    expect(result.stats.products).toBe(1);
  });
});
