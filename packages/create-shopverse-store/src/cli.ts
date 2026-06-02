#!/usr/bin/env node
// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * `create-shopverse-store` bin entrypoint.
 *
 * Usage:
 *   npx create-shopverse-store "<name>" [options]
 *
 * Options:
 *   --currency=<ISO>      ISO 4217 currency (default: USD)
 *   --country=<ISO>       ISO 3166-1 alpha-2 country (default: US)
 *   --locale=<BCP47>      BCP 47 locale (default: en-US)
 *   --region=<id>         region-pack id label, e.g. india | us (default: none)
 *   --tax-rate=<n>        default tax fraction, 0.18 = 18% (default: 0)
 *   --free-shipping=<n>   free-shipping threshold (default: 0)
 *   --shipping-fee=<n>    flat shipping fee (default: 0)
 *   --hide-badge          set NEXT_PUBLIC_HIDE_POWERED_BY=true (needs a license)
 *   --railway             emit railway.json (backend service blueprint)
 *   --render              emit render.yaml (db + api + web blueprint)
 *   --repo-root=<dir>     override repo-root detection (default: cwd)
 *
 * Examples:
 *   npx create-shopverse-store "Acme Outfitters"
 *   npx create-shopverse-store "Mumbai Mart" --currency=INR --country=IN --locale=en-IN --region=india --render
 */

import * as path from 'node:path';
import { scaffold } from './scaffold';

interface Parsed {
  name: string | undefined;
  flags: Record<string, string | true>;
}

function parseArgs(argv: readonly string[]): Parsed {
  const flags: Record<string, string | true> = {};
  let name: string | undefined;
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq >= 0) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        flags[a.slice(2)] = true;
      }
    } else if (name === undefined) {
      name = a;
    }
  }
  return { name, flags };
}

function str(v: string | true | undefined, fallback: string): string {
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

function num(v: string | true | undefined, fallback: number): number {
  if (typeof v !== 'string') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function printHelp(): void {
  console.log(
    'Usage: npx create-shopverse-store "<name>" [options]\n' +
      '\n' +
      '  name                 store display name (e.g. "Acme Outfitters")\n' +
      '  --currency=<ISO>     ISO 4217 currency (default: USD)\n' +
      '  --country=<ISO>      ISO 3166-1 alpha-2 country (default: US)\n' +
      '  --locale=<BCP47>     BCP 47 locale (default: en-US)\n' +
      '  --region=<id>        region-pack label, e.g. india | us (default: none)\n' +
      '  --tax-rate=<n>       default tax fraction, 0.18 = 18% (default: 0)\n' +
      '  --free-shipping=<n>  free-shipping threshold (default: 0)\n' +
      '  --shipping-fee=<n>   flat shipping fee (default: 0)\n' +
      '  --hide-badge         set NEXT_PUBLIC_HIDE_POWERED_BY=true (needs a license)\n' +
      '  --railway            emit railway.json\n' +
      '  --render             emit render.yaml\n' +
      '  --repo-root=<dir>    override repo-root detection (default: cwd)\n',
  );
}

function main(): void {
  const { name, flags } = parseArgs(process.argv.slice(2));

  if (!name || flags.help === true || name === '--help') {
    printHelp();
    process.exit(name ? 0 : 2);
  }

  const repoRoot =
    typeof flags['repo-root'] === 'string' ? path.resolve(flags['repo-root']) : process.cwd();

  try {
    const result = scaffold({
      name: name as string,
      repoRoot,
      currency: str(flags.currency, 'USD').toUpperCase(),
      country: str(flags.country, 'US').toUpperCase(),
      locale: str(flags.locale, 'en-US'),
      region: str(flags.region, ''),
      taxRate: num(flags['tax-rate'], 0),
      freeShippingThreshold: num(flags['free-shipping'], 0),
      shippingFee: num(flags['shipping-fee'], 0),
      hideBadge: flags['hide-badge'] === true,
      withRailway: flags.railway === true,
      withRender: flags.render === true,
    });

    console.log(`\n✓ Configured "${result.storeName}" (${result.filesWritten.length} files):`);
    for (const f of result.filesWritten) {
      console.log(`  + ${f}`);
    }
    if (result.warnings.length > 0) {
      console.log('\nWarnings:');
      for (const w of result.warnings) {
        console.log(`  ⚠ ${w}`);
      }
    }
    console.log('\nNext steps:');
    for (const step of result.nextSteps) {
      console.log(`  • ${step}`);
    }
    console.log('\nDocs: STORE_SETUP.md (this store) · README.md (operator guide)');
    process.exit(0);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
