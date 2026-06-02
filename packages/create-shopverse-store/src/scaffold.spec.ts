// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { scaffold, slugify, type ScaffoldStoreOptions } from './scaffold';

function makeRepoRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'store-'));
  // Most refuse-to-clobber + warning logic checks for backend/ — create it.
  fs.mkdirSync(path.join(root, 'backend'), { recursive: true });
  return root;
}

function readFile(repoRoot: string, rel: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

function baseOpts(over: Partial<ScaffoldStoreOptions> = {}): ScaffoldStoreOptions {
  return {
    name: 'Acme Outfitters',
    repoRoot: makeRepoRoot(),
    currency: 'USD',
    country: 'US',
    locale: 'en-US',
    region: '',
    taxRate: 0,
    freeShippingThreshold: 0,
    shippingFee: 0,
    hideBadge: false,
    withRailway: false,
    withRender: false,
    generateSecret: () => 'TEST_SECRET_0123456789abcdef0123456789abcdef',
    ...over,
  };
}

describe('slugify', () => {
  it('lowercases + hyphenates a multi-word name', () => {
    expect(slugify('Acme Outfitters')).toBe('acme-outfitters');
    expect(slugify('  Mumbai  Mart!! ')).toBe('mumbai-mart');
    expect(slugify('CAPS & Symbols #1')).toBe('caps-symbols-1');
  });
  it('falls back to "store" when nothing usable remains', () => {
    expect(slugify('!!!')).toBe('store');
  });
});

describe('scaffold', () => {
  it('emits 4 base files for a minimal store', () => {
    const opts = baseOpts();
    const result = scaffold(opts);
    expect(result.slug).toBe('acme-outfitters');
    expect(result.filesWritten).toHaveLength(4);
    expect(result.filesWritten).toEqual(
      expect.arrayContaining([
        'backend/.env',
        'frontend/.env.local',
        'store.config.json',
        'STORE_SETUP.md',
      ]),
    );
  });

  it('bakes currency + locale into frontend/.env.local', () => {
    const opts = baseOpts({ currency: 'EUR', locale: 'de-DE' });
    scaffold(opts);
    const env = readFile(opts.repoRoot, 'frontend/.env.local');
    expect(env).toContain('NEXT_PUBLIC_STORE_CURRENCY=EUR');
    expect(env).toContain('NEXT_PUBLIC_STORE_LOCALE=de-DE');
    expect(env).toContain('NEXT_PUBLIC_HIDE_POWERED_BY=false');
  });

  it('emits backend/.env with every boot-required var + generated JWT_SECRET', () => {
    const opts = baseOpts();
    scaffold(opts);
    const env = readFile(opts.repoRoot, 'backend/.env');
    expect(env).toContain('DATABASE_URL=');
    expect(env).toContain('STRIPE_SECRET_KEY=');
    expect(env).toContain('STRIPE_WEBHOOK_SECRET=');
    expect(env).toContain('JWT_SECRET="TEST_SECRET_0123456789abcdef0123456789abcdef"');
  });

  it('store.config.json mirrors StoreSettings; region null when none', () => {
    const opts = baseOpts({ taxRate: 0.07, freeShippingThreshold: 50, shippingFee: 5 });
    scaffold(opts);
    const cfg = JSON.parse(readFile(opts.repoRoot, 'store.config.json'));
    expect(cfg.name).toBe('Acme Outfitters');
    expect(cfg.slug).toBe('acme-outfitters');
    expect(cfg.storeSettings).toEqual({
      currency: 'USD',
      country: 'US',
      locale: 'en-US',
      region: null,
      taxRate: 0.07,
      freeShippingThreshold: 50,
      shippingFee: 5,
    });
  });

  it('region → config.region set + a nextStep to enable the pack', () => {
    const opts = baseOpts({ currency: 'INR', country: 'IN', locale: 'en-IN', region: 'india', taxRate: 0.18 });
    const result = scaffold(opts);
    const cfg = JSON.parse(readFile(opts.repoRoot, 'store.config.json'));
    expect(cfg.storeSettings.region).toBe('india');
    expect(result.nextSteps.some((s) => s.includes('@shopverse/plugin-india'))).toBe(true);
  });

  it('--railway emits valid railway.json with the /api/health probe', () => {
    const opts = baseOpts({ withRailway: true });
    const result = scaffold(opts);
    expect(result.filesWritten).toContain('railway.json');
    const rw = JSON.parse(readFile(opts.repoRoot, 'railway.json'));
    expect(rw.build.dockerfilePath).toBe('backend/Dockerfile');
    expect(rw.deploy.healthcheckPath).toBe('/api/health');
  });

  it('--render emits render.yaml with db + api + web and baked currency', () => {
    const opts = baseOpts({ currency: 'GBP', withRender: true });
    const result = scaffold(opts);
    expect(result.filesWritten).toContain('render.yaml');
    const yaml = readFile(opts.repoRoot, 'render.yaml');
    expect(yaml).toContain('databases:');
    expect(yaml).toContain('-api');
    expect(yaml).toContain('-web');
    expect(yaml).toContain('./backend/Dockerfile');
    expect(yaml).toContain('./frontend/Dockerfile');
    expect(yaml).toContain('NEXT_PUBLIC_STORE_CURRENCY');
    expect(yaml).toContain('value: GBP');
  });

  it('both deploy flags → 6 files (3 base + 2 deploy + STORE_SETUP)', () => {
    const opts = baseOpts({ withRailway: true, withRender: true });
    const result = scaffold(opts);
    expect(result.filesWritten).toHaveLength(6);
  });

  it('hideBadge → NEXT_PUBLIC_HIDE_POWERED_BY=true + a license warning', () => {
    const opts = baseOpts({ hideBadge: true });
    const result = scaffold(opts);
    expect(readFile(opts.repoRoot, 'frontend/.env.local')).toContain('NEXT_PUBLIC_HIDE_POWERED_BY=true');
    expect(result.warnings.some((w) => w.includes('commercial'))).toBe(true);
  });

  it('refuses to clobber an existing backend/.env', () => {
    const opts = baseOpts();
    fs.writeFileSync(path.join(opts.repoRoot, 'backend', '.env'), 'EXISTING');
    expect(() => scaffold(opts)).toThrow(/already exists/);
    // The existing file must be untouched.
    expect(readFile(opts.repoRoot, 'backend/.env')).toBe('EXISTING');
  });

  it('refuses to clobber an existing render.yaml only when --render is set', () => {
    const a = baseOpts();
    fs.writeFileSync(path.join(a.repoRoot, 'render.yaml'), 'EXISTING');
    expect(() => scaffold(a)).not.toThrow(); // not requested → ignored

    const b = baseOpts({ withRender: true });
    fs.writeFileSync(path.join(b.repoRoot, 'render.yaml'), 'EXISTING');
    expect(() => scaffold(b)).toThrow(/already exists/);
  });

  it('validates currency / country / locale / taxRate', () => {
    expect(() => scaffold(baseOpts({ currency: 'usd' }))).toThrow(/ISO 4217/);
    expect(() => scaffold(baseOpts({ currency: 'DOLLAR' }))).toThrow(/ISO 4217/);
    expect(() => scaffold(baseOpts({ country: 'USA' }))).toThrow(/ISO 3166/);
    expect(() => scaffold(baseOpts({ locale: 'english' }))).toThrow(/BCP 47/);
    expect(() => scaffold(baseOpts({ taxRate: 18 }))).toThrow(/fraction/);
    expect(() => scaffold(baseOpts({ name: 'a' }))).toThrow(/at least 2/);
  });

  it('warns when backend/ is absent (wrong directory)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bare-'));
    const result = scaffold(baseOpts({ repoRoot: root }));
    expect(result.warnings.some((w) => w.includes('backend/ not found'))).toBe(true);
  });
});
