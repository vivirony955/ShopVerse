#!/usr/bin/env node
// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * W5.T6 — hydration weight per page gate (plan §10 E18).
 *
 * Sums the raw byte size of plugin source code per kernel page,
 * via the slot-name → page map. Asserts ≤ 80KB per page. This is a
 * conservative v1 measurement: raw bytes always exceed minified
 * + gzipped output. A page tripping this gate is comfortably over
 * the real hydration budget; one passing is comfortably under.
 *
 * Per-bundle minified attribution rolls forward to W6 once the
 * codegen + webpack-stats integration lands.
 *
 * Usage: `npm run hydration:check`
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PLUGINS_DIR = path.join(ROOT, 'src', 'plugins');

const PER_PAGE_CAP_KB = 80;

// Slot name → kernel page (App Router route). Keep this in sync
// with `frontend/src/lib/slots.ts` `SlotName` union and the
// docs/plugins/slots.md table.
const SLOT_TO_PAGE = {
  'nav.beforeUserMenu': 'global', // navbar renders on every page
  'pdp.afterDescription': '/products/[id]',
  'pdp.priceWidget': '/products/[id]',
  'pdp.beforeAddToCart': '/products/[id]',
  'plp.beforeFilters': '/products',
  'cart.afterItems': 'global', // cart drawer renders on every page
  'cart.beforeCheckout': 'global',
  'checkout.beforePaymentMethod': '/checkout',
  'checkout.afterAddress': '/checkout',
  'orders.afterSummary': '/orders/[id]',
  'profile.afterTabs': '/profile',
  'admin.afterDashboard': '/admin',
};

function listPluginDirs() {
  if (!fs.existsSync(PLUGINS_DIR)) return [];
  return fs
    .readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function walkSourceBytes(dir) {
  let bytes = 0;
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      const sub = walkSourceBytes(p);
      bytes += sub.bytes;
      files.push(...sub.files);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      const size = fs.statSync(p).size;
      bytes += size;
      files.push({ path: p, size });
    }
  }
  return { bytes, files };
}

function parseSlotsFromIndex(pluginDir) {
  // Best-effort static parse — looks for `name: '<slot-name>'` lines.
  const idx = path.join(pluginDir, 'index.ts');
  if (!fs.existsSync(idx)) return [];
  const src = fs.readFileSync(idx, 'utf8');
  const matches = [...src.matchAll(/name:\s*['"]([\w.]+)['"]/g)];
  return matches.map((m) => m[1]);
}

function main() {
  const plugins = listPluginDirs();
  if (plugins.length === 0) {
    console.log('[hydration-weight] no plugins under frontend/src/plugins/ — passing trivially');
    process.exit(0);
  }

  // Per-page byte totals: sum every plugin's source bytes for every
  // page where that plugin registers ≥ 1 slot.
  const pageBytes = {};
  const perPluginReport = [];

  for (const plugin of plugins) {
    const dir = path.join(PLUGINS_DIR, plugin);
    const { bytes, files } = walkSourceBytes(dir);
    const slotNames = parseSlotsFromIndex(dir);
    const pages = new Set(
      slotNames
        .map((n) => SLOT_TO_PAGE[n])
        .filter(Boolean),
    );
    perPluginReport.push({
      plugin,
      bytes,
      files: files.length,
      slots: slotNames,
      pages: [...pages],
    });
    for (const page of pages) {
      pageBytes[page] = (pageBytes[page] || 0) + bytes;
    }
  }

  console.log('[hydration-weight] per-plugin source bytes:');
  for (const r of perPluginReport) {
    console.log(
      `  ${r.plugin}: ${(r.bytes / 1024).toFixed(2)} kB (${r.files} files) → ${r.pages.join(', ') || '(no slots — unwired)'}`,
    );
  }
  console.log('\n[hydration-weight] per-page totals (sum of plugin source bytes):');
  for (const [page, bytes] of Object.entries(pageBytes)) {
    console.log(`  ${page}: ${(bytes / 1024).toFixed(2)} kB`);
  }

  const overBudget = Object.entries(pageBytes).filter(
    ([, b]) => b / 1024 > PER_PAGE_CAP_KB,
  );
  if (overBudget.length > 0) {
    console.error(
      `\n[hydration-weight] FAIL — ${overBudget.length} page(s) exceeded the ${PER_PAGE_CAP_KB} kB hydration cap:`,
    );
    for (const [page, b] of overBudget) {
      console.error(`  ${page}: ${(b / 1024).toFixed(2)} kB`);
    }
    process.exit(1);
  }

  console.log(`\n[hydration-weight] OK — every page's plugin contribution is ≤ ${PER_PAGE_CAP_KB} kB`);
  process.exit(0);
}

main();
