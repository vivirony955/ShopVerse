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
import { runAudit } from './audit';
import { runUninstall } from './uninstall';
import { seedAll, formatSeedReport, allSucceededSeed } from './seed';
import type { PluginManifest } from '@shopverse/sdk';

function parseArgs(argv: readonly string[]): {
  command: string | undefined;
  positional: string[];
  flags: Record<string, string | true>;
} {
  const [command, ...rest] = argv;
  const flags: Record<string, string | true> = {};
  const positional: string[] = [];
  for (const a of rest) {
    if (!a.startsWith('--')) {
      positional.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    if (eq >= 0) {
      flags[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      flags[a.slice(2)] = true;
    }
  }
  return { command, positional, flags };
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

function auditCompleteness(flags: Record<string, string | true>): void {
  const matrixPath =
    typeof flags.matrix === 'string'
      ? flags.matrix
      : path.resolve(
          process.cwd(),
          'cross-cutting',
          'COMPLETENESS_MATRIX.md',
        );
  const code = runAudit({
    matrixPath,
    strict: flags.strict === true,
  });
  process.exit(code);
}

function pluginUninstall(
  positional: string[],
  flags: Record<string, string | true>,
): void {
  const pluginId = positional[0];
  if (!pluginId) {
    console.error(
      '[shopverse] usage: shopverse plugin:uninstall <id> [--drop-data] [--manifest=plugins.config.ts]',
    );
    process.exit(2);
  }
  const manifestPath =
    typeof flags.manifest === 'string' ? flags.manifest : 'plugins.config.ts';
  const manifest = loadManifest(manifestPath);
  const code = runUninstall({
    manifest,
    pluginId,
    dropData: flags['drop-data'] === true,
  });
  process.exit(code);
}

async function pluginSeed(
  positional: string[],
  flags: Record<string, string | true>,
): Promise<void> {
  const manifestPath =
    typeof flags.manifest === 'string' ? flags.manifest : 'plugins.config.ts';
  const manifest = loadManifest(manifestPath);
  const onlyPluginId = positional[0];

  console.log(
    '[shopverse] plugin:seed requires a Prisma client injected via the SDK runtime.\n' +
      'The CLI today emits the seed dispatch plan; embed `seedAll({ manifest, ctx: { prisma } })`\n' +
      'in your operator-side script with your configured client.\n',
  );

  // Without a Prisma client, run with a placeholder ctx so authors
  // get a dry-run report of which plugins ship a seed entry.
  const results = await seedAll({
    manifest,
    onlyPluginId,
    ctx: { prisma: null },
    // No-op loader for dry-run: don't actually import the seed
    // module since we have no live Prisma to give it.
    loader: () => ({
      default: () => {
        throw new Error('Prisma client not injected — embed seedAll() in your operator script');
      },
    }),
  });
  console.log(formatSeedReport(results));
  process.exit(allSucceededSeed(results) ? 0 : 1);
}

function main(): void {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));
  switch (command) {
    case 'plugin:migrate':
      pluginMigrate(flags);
      return;
    case 'plugin:uninstall':
      pluginUninstall(positional, flags);
      return;
    case 'plugin:seed':
      void pluginSeed(positional, flags);
      return;
    case 'audit:completeness':
      auditCompleteness(flags);
      return;
    case undefined:
    case 'help':
    case '--help':
      console.log(
        'Usage: shopverse <command> [options]\n' +
          '\nCommands:\n' +
          '  plugin:migrate [--manifest=plugins.config.ts]                 Run plugin migrations in declared order\n' +
          '  plugin:uninstall <id> [--drop-data] [--manifest=path]         Show how to remove a plugin; with --drop-data prints DROP statements\n' +
          '  plugin:seed [<id>] [--manifest=path]                          Dispatch plan for plugin seeds; embed seedAll() to execute\n' +
          '  audit:completeness [--matrix=path] [--strict]                 Report COMPLETENESS_MATRIX status; exit 0 only when done\n',
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
