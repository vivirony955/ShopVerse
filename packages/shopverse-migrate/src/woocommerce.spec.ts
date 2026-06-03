// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { parseCsvTable } from './csv';
import { fromWoo } from './woocommerce';

const HEADER =
  'ID,Type,SKU,Name,Published,Description,Regular price,Sale price,Categories,' +
  'Tags,Images,Stock,Parent,Attribute 1 name,Attribute 1 value(s)';

function run(rows: string) {
  return fromWoo(parseCsvTable(`${HEADER}\n${rows}`));
}

describe('fromWoo', () => {
  it('maps a simple product to a single default variant', () => {
    const { products } = run(
      '101,simple,MUG-1,Coffee Mug,1,"<p>A mug</p>",12.00,,Home > Kitchen,kitchen,https://img/mug.jpg,50,,,',
    );
    expect(products).toHaveLength(1);
    const p = products[0];
    expect(p.name).toBe('Coffee Mug');
    expect(p.slug).toBe('coffee-mug');
    expect(p.description).toBe('A mug');
    expect(p.category).toBe('Kitchen'); // leaf of "Home > Kitchen"
    expect(p.basePrice).toBe(12);
    expect(p.discountPct).toBe(0);
    expect(p.variants).toEqual([
      { size: 'One Size', color: 'Default', sku: 'MUG-1', stock: 50 },
    ]);
  });

  it('attaches variations to their variable parent by id and derives size', () => {
    const { products, skipped } = run(
      '200,variable,TEE,Graphic Tee,1,"<p>Tee</p>",,,Apparel > Shirts,cotton,https://img/tee.jpg,,,Size,Small | Large\n' +
        ',variation,TEE-S,,1,,21.00,18.00,,,,7,id:200,Size,Small\n' +
        ',variation,TEE-L,,1,,21.00,,,,,3,id:200,Size,Large',
    );

    expect(skipped).toBe(0);
    expect(products).toHaveLength(1);
    const p = products[0];
    expect(p.name).toBe('Graphic Tee');
    // Parent price is blank → adopt the first variation's (21 list, 18 sale).
    expect(p.basePrice).toBe(21);
    expect(p.discountPct).toBe(14); // (21-18)/21 ≈ 14%
    expect(p.variants).toEqual([
      { size: 'Small', color: 'Default', sku: 'TEE-S', stock: 7 },
      { size: 'Large', color: 'Default', sku: 'TEE-L', stock: 3 },
    ]);
  });

  it('skips a variation that references an unknown parent', () => {
    const { products, skipped, warnings } = run(
      ',variation,ORPHAN,,1,,9.99,,,,,1,id:999,Size,Small',
    );
    expect(products).toHaveLength(0);
    expect(skipped).toBe(1);
    expect(warnings.some((w) => w.includes('unknown parent'))).toBe(true);
  });

  it('treats Published=0 as inactive', () => {
    const { products } = run('1,simple,A,Hidden,0,,5.00,,Misc,,,,,,');
    expect(products[0].isActive).toBe(false);
  });
});
