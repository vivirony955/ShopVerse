#!/usr/bin/env node
// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * `create-shopverse-plugin` bin entrypoint.
 *
 * Usage:
 *   npx create-shopverse-plugin <name> [options]
 *
 * Options:
 *   --frontend         emit frontend/src/plugins/<name>/Widget.tsx + index
 *   --schema           emit prisma/schema/<name>.prisma (empty starter)
 *   --repo-root=<dir>  override repo-root detection (default: cwd)
 *
 * Examples:
 *   npx create-shopverse-plugin my-feature
 *   npx create-shopverse-plugin my-feature --frontend --schema
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
    } else if (!name) {
      name = a;
    }
  }
  return { name, flags };
}

function printHelp(): void {
  console.log(
    'Usage: npx create-shopverse-plugin <name> [--frontend] [--schema] [--repo-root=<dir>]\n' +
      '\n' +
      '  name             plugin name (lowercase alphanumeric + hyphens, e.g. my-feature)\n' +
      '  --frontend       emit frontend/src/plugins/<name>/ widget + index\n' +
      '  --schema         emit prisma/schema/<name>.prisma (empty starter)\n' +
      '  --repo-root=<d>  override repo-root detection (default: cwd)\n',
  );
}

function main(): void {
  const { name, flags } = parseArgs(process.argv.slice(2));

  if (!name || flags.help === true || name === '--help') {
    printHelp();
    process.exit(name ? 0 : 2);
  }

  const repoRoot =
    typeof flags['repo-root'] === 'string'
      ? path.resolve(flags['repo-root'])
      : process.cwd();

  try {
    const result = scaffold({
      name,
      repoRoot,
      withFrontend: flags.frontend === true,
      withSchema: flags.schema === true,
    });

    console.log(`\n✓ Created ${result.pluginId} (${result.filesWritten.length} files):`);
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
    console.log(
      '\nDocs: docs/plugins/tutorial.md (10-min walkthrough), docs/plugins/guide.md (full author guide)',
    );
    process.exit(0);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
