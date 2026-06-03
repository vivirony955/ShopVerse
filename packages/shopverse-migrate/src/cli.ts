#!/usr/bin/env node
// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * `shopverse-migrate` bin entrypoint.
 *
 * Usage:
 *   npx shopverse-migrate import <file.csv> [--platform=shopify|woocommerce] [--out=shopverse-import.json]
 *   npx shopverse-migrate savings --gmv=<n> [--platform=shopify] [--plan=basic|shopify|advanced|plus]
 *                                 [--no-shopify-payments] [--woo-monthly=<n>] [--infra=<n>]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { importProducts } from './import';
import { calculateSavings } from './savings';
import type { ShopifyPlan } from './savings';
import type { SourcePlatform } from './types';

type Flags = Record<string, string | true>;

interface Parsed {
  command: string | undefined;
  positionals: string[];
  flags: Flags;
}

function parseArgs(argv: readonly string[]): Parsed {
  const flags: Flags = {};
  const positionals: string[] = [];
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq >= 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else flags[a.slice(2)] = true;
    } else {
      positionals.push(a);
    }
  }
  const [command, ...rest] = positionals;
  return { command, positionals: rest, flags };
}

function str(v: string | true | undefined): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function num(v: string | true | undefined, fallback: number): number {
  if (typeof v !== 'string') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function money(n: number): string {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function printHelp(): void {
  console.log(
    'shopverse-migrate — import a store + estimate savings\n' +
      '\n' +
      'Commands:\n' +
      '  import <file.csv>     Convert a Shopify/WooCommerce product export to ShopVerse JSON\n' +
      '    --platform=<p>      shopify | woocommerce (default: auto-detect)\n' +
      '    --out=<file>        output path (default: shopverse-import.json)\n' +
      '\n' +
      '  savings --gmv=<n>     Estimate annual savings vs your current platform\n' +
      '    --platform=<p>      shopify | woocommerce (default: shopify)\n' +
      '    --plan=<p>          shopify plan: basic | shopify | advanced | plus (default: basic)\n' +
      '    --no-shopify-payments   you pay Shopify the extra platform transaction fee\n' +
      '    --woo-monthly=<n>   WooCommerce all-in monthly cost (default: 70)\n' +
      '    --infra=<n>         ShopVerse self-host monthly infra (default: 25)\n',
  );
}

function runImport(positionals: string[], flags: Flags): number {
  const file = positionals[0];
  if (!file) {
    console.error('error: missing <file.csv>. Usage: shopverse-migrate import <file.csv>');
    return 2;
  }
  const inputPath = path.resolve(file);
  if (!fs.existsSync(inputPath)) {
    console.error(`error: file not found: ${inputPath}`);
    return 1;
  }

  const platform = str(flags.platform) as SourcePlatform | undefined;
  if (platform && platform !== 'shopify' && platform !== 'woocommerce') {
    console.error(`error: --platform must be shopify or woocommerce (got "${platform}")`);
    return 2;
  }

  const csv = fs.readFileSync(inputPath, 'utf8');
  const result = importProducts(csv, platform ? { platform } : {});

  const outPath = path.resolve(str(flags.out) ?? 'shopverse-import.json');
  fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  console.log(`\n✓ Imported from ${result.source}:`);
  console.log(`  products: ${result.stats.products}`);
  console.log(`  variants: ${result.stats.variants}`);
  console.log(`  rows read: ${result.stats.rows}  ·  skipped: ${result.stats.skipped}`);
  console.log(`  → ${outPath}`);

  if (result.warnings.length > 0) {
    const shown = result.warnings.slice(0, 10);
    console.log(`\n${result.warnings.length} warning(s):`);
    for (const w of shown) console.log(`  ⚠ ${w}`);
    if (result.warnings.length > shown.length) {
      console.log(`  … and ${result.warnings.length - shown.length} more`);
    }
  }
  console.log('\nNext: review the JSON, then load it via your seed/import script.');
  return 0;
}

function runSavings(flags: Flags): number {
  if (flags.gmv === undefined) {
    console.error('error: --gmv=<n> is required. Example: shopverse-migrate savings --gmv=250000');
    return 2;
  }
  const platform = (str(flags.platform) ?? 'shopify') as SourcePlatform;
  if (platform !== 'shopify' && platform !== 'woocommerce') {
    console.error(`error: --platform must be shopify or woocommerce (got "${platform}")`);
    return 2;
  }

  const result = calculateSavings({
    annualGmv: num(flags.gmv, 0),
    platform,
    shopifyPlan: (str(flags.plan) ?? 'basic') as ShopifyPlan,
    usesShopifyPayments: flags['no-shopify-payments'] !== true,
    wooMonthlyCost: str(flags['woo-monthly']) ? num(flags['woo-monthly'], 70) : undefined,
    shopverseMonthlyInfra: str(flags.infra) ? num(flags.infra, 25) : undefined,
  });

  const pct = Math.round(result.savingsPct * 100);
  console.log('\nEstimated annual savings vs your current platform\n');
  console.log(`  Annual GMV:            ${money(result.annualGmv)}`);
  console.log(`  Current platform cost: ${money(result.currentAnnualCost)}/yr`);
  console.log(`    · subscription:      ${money(result.breakdown.currentSubscription)}/yr`);
  console.log(`    · transaction fees:  ${money(result.breakdown.currentTransactionFees)}/yr`);
  console.log(`  ShopVerse cost:        ${money(result.shopverseAnnualCost)}/yr (self-host infra)`);
  console.log(`\n  → You save ~${money(result.annualSavings)}/yr (${pct}%)\n`);

  if (result.overGmvThreshold) {
    console.log('  Note: GMV is over the $100k gate — a ShopVerse commercial license applies.\n');
  }
  console.log('Assumptions (all estimates — verify against your real numbers):');
  for (const a of result.assumptions) console.log(`  • ${a}`);
  return 0;
}

function main(): void {
  const { command, positionals, flags } = parseArgs(process.argv.slice(2));

  if (!command || command === 'help' || flags.help === true) {
    printHelp();
    process.exit(command ? 0 : 2);
  }

  try {
    let code: number;
    if (command === 'import') code = runImport(positionals, flags);
    else if (command === 'savings') code = runSavings(flags);
    else {
      console.error(`error: unknown command "${command}". Run with --help.`);
      code = 2;
    }
    process.exit(code);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
