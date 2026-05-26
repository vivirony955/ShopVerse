#!/usr/bin/env node
// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * `shopverse` CLI entrypoint. Subcommands:
 *
 *   shopverse plugin:migrate [--manifest=plugins.config.ts]
 *     Runs each plugin's prisma migrations in the declared order
 *     (plan §10 E9, W1.T26).
 *
 * Future subcommands (W6):
 *   shopverse plugin:seed
 *   shopverse plugin:uninstall --drop-data
 *   shopverse audit:completeness
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  allSucceeded,
  DefaultMigrationRunner,
  migrateAll,
  type PluginMigrationResult,
} from './migrate';
import type { PluginManifest } from '@shopverse/sdk';

function parseArgs(argv: readonly string[]): {
  command: string | undefined;
  flags: Record<string, string | true>;
} {
  const [command, ...rest] = argv;
  const flags: Record<string, string | true> = {};
  for (const a of rest) {
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq >= 0) {
      flags[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      flags[a.slice(2)] = true;
    }
  }
  return { command, flags };
}

function loadManifest(manifestPath: string): PluginManifest {
  const abs = path.resolve(process.cwd(), manifestPath);
  if (!fs.existsSync(abs)) {
    console.error(`[shopverse] manifest not found: ${abs}`);
    process.exit(2);
  }
  // ESM or CJS module — require either default export or named `default`.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(abs) as { default?: PluginManifest } | PluginManifest;
  const manifest = (mod as { default?: PluginManifest }).default ?? mod;
  return manifest as PluginManifest;
}

function pluginMigrate(flags: Record<string, string | true>): void {
  const manifestPath =
    typeof flags.manifest === 'string' ? flags.manifest : 'plugins.config.ts';
  const manifest = loadManifest(manifestPath);
  const runner = new DefaultMigrationRunner();
  const results = migrateAll(manifest, runner);

  for (const r of results) {
    const tag = r.status === 'applied' ? '✓' : r.status === 'skipped' ? '·' : '✗';
    const detail = r.reason ? ` (${r.reason})` : '';
    console.log(`${tag} ${r.pluginId} — ${r.status}${detail}`);
  }

  if (!allSucceeded(results)) {
    process.exit(1);
  }
}

function main(): void {
  const { command, flags } = parseArgs(process.argv.slice(2));
  switch (command) {
    case 'plugin:migrate':
      pluginMigrate(flags);
      return;
    case undefined:
    case 'help':
    case '--help':
      console.log(
        'Usage: shopverse <command> [options]\n' +
          '\nCommands:\n' +
          '  plugin:migrate [--manifest=plugins.config.ts]   Run plugin migrations in declared order\n',
      );
      return;
    default:
      console.error(`[shopverse] unknown command: ${command}`);
      process.exit(2);
  }
}

main();

// Library re-exports — also available as `import { migrateAll } from
// '@shopverse/cli'` for in-process callers.
export type { PluginMigrationResult };
