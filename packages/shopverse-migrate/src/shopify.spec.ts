// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { parseCsvTable } from './csv';
import { fromShopify } from './shopify';

const HEADER =
  'Handle,Title,Body (HTML),Vendor,Product Category,Type,Tags,Published,' +
  'Option1 Name,Option1 Value,Option2 Name,Option2 Value,' +
  'Variant SKU,Variant Price,Variant Compare At Price,Variant Inventory Qty,Image Src';

function run(rows: string) {
  return fromShopify(parseCsvTable(`${HEADER}\n${rows}`));
}

describe('fromShopify', () => {
  it('groups variant rows by handle and collects images', () => {
    const { products, skipped } = run(
      'classic-tee,Classic Tee,"<p>Soft &amp; cozy</p>",Acme,Apparel,Shirt,"summer,cotton",TRUE,Size,Small,Color,Red,TEE-S-RED,19.99,29.99,10,https://img/1.jpg\n' +
        'classic-tee,,,,,,,,Size,Large,Color,Red,TEE-L-RED,19.99,29.99,5,https://img/2.jpg',
    );

    expect(skipped).toBe(0);
    expect(products).toHaveLength(1);
    const p = products[0];
    expect(p.name).toBe('Classic Tee');
    expect(p.slug).toBe('classic-tee');
    expect(p.description).toBe('Soft & cozy');
    expect(p.brand).toBe('Acme');
    expect(p.category).toBe('Apparel');
    expect(p.tags).toEqual(['summer', 'cotton']);
    expect(p.isActive).toBe(true);
    expect(p.images).toEqual(['https://img/1.jpg', 'https://img/2.jpg']);
    expect(p.variants).toEqual([
      { size: 'Small', color: 'Red', sku: 'TEE-S-RED', stock: 10 },
      { size: 'Large', color: 'Red', sku: 'TEE-L-RED', stock: 5 },
    ]);
  });

  it('derives basePrice + discount from the compare-at price', () => {
    const { products } = run(
      'classic-tee,Classic Tee,,Acme,Apparel,,,,Size,Small,Color,Red,TEE-S,19.99,29.99,10,',
    );
    expect(products[0].basePrice).toBe(29.99);
    expect(products[0].discountPct).toBe(33); // (29.99-19.99)/29.99 ≈ 33%
  });

  it('maps a single "Default Title" variant to One Size / Default', () => {
    const { products } = run('mug,Mug,A mug,Acme,Home,,,,Title,Default Title,,,MUG-1,9.99,,100,');
    expect(products[0].variants).toEqual([
      { size: 'One Size', color: 'Default', sku: 'MUG-1', stock: 100 },
    ]);
    expect(products[0].discountPct).toBe(0);
  });

  it('warns when variants are priced differently and uses the first', () => {
    const { products, warnings } = run(
      'tee,Tee,,Acme,Apparel,,,,Size,S,,,TEE-S,10.00,,1,\n' +
        'tee,,,,,,,,Size,L,,,TEE-L,20.00,,1,',
    );
    expect(products[0].basePrice).toBe(10);
    expect(warnings.some((w) => w.includes('priced differently'))).toBe(true);
  });

  it('skips rows without a handle', () => {
    const { products, skipped } = run(',No Handle,,,,,,,Size,S,,,X,1.00,,1,');
    expect(products).toHaveLength(0);
    expect(skipped).toBe(1);
  });
});
