// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * W6.T7 — `shopverse plugin:uninstall <id> [--drop-data]`
 * (plan §10 E5).
 *
 * The CLI is print-only by design: it tells the operator what to
 * do, never executes a destructive operation by itself. Two modes:
 *
 *   1. Default (no flag) — print the manifest edit instruction.
 *      Reminds operators to also remove the plugin's directory
 *      and rebuild.
 *
 *   2. `--drop-data` — print the DROP TABLE statements derived
 *      from `prisma/schema/<plugin>.prisma`. The operator runs
 *      the SQL manually (e.g. via `npx prisma db execute`).
 *
 * Why no auto-execute: dropping a plugin's tables is irreversible.
 * Print-only forces a human to read what's about to happen and
 * paste it into the right environment. The operational ergonomics
 * cost is small (one extra command); the safety dividend is large
 * (no accidental prod drop because someone typo'd the env var).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PluginManifest, PluginManifestEntry } from '@shopverse/sdk';

export interface UninstallOptions {
  manifest: PluginManifest;
  pluginId: string;
  dropData: boolean;
  /** Resolved against process.cwd() when reading the prisma schema. */
  repoRoot?: string;
}

export interface UninstallResult {
  pluginId: string;
  entry: PluginManifestEntry | undefined;
  schemaFile: string | undefined;
  dropStatements: string[];
  messages: string[];
}

const MODEL_PATTERN = /^model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm;

function readPluginSchema(
  repoRoot: string,
  manifestEntry: PluginManifestEntry,
): { file: string; models: string[] } | undefined {
  // Convention: plugin schemas live at prisma/schema/<plugin>.prisma
  // where <plugin> is the id's tail (`@shopverse/plugin-blog` →
  // `blog`).
  const idTail = manifestEntry.id.split('/').pop() ?? manifestEntry.id;
  const candidate = idTail.startsWith('plugin-')
    ? idTail.slice('plugin-'.length)
    : idTail;
  const file = path.resolve(repoRoot, 'prisma', 'schema', `${candidate}.prisma`);
  if (!fs.existsSync(file)) return undefined;
  const src = fs.readFileSync(file, 'utf8');
  const models: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = MODEL_PATTERN.exec(src)) !== null) {
    models.push(m[1]);
  }
  return { file, models };
}

export function planUninstall(opts: UninstallOptions): UninstallResult {
  const repoRoot = opts.repoRoot ?? process.cwd();
  const entry = opts.manifest.plugins.find((p) => p.id === opts.pluginId);
  const messages: string[] = [];

  if (!entry) {
    messages.push(
      `[shopverse] plugin '${opts.pluginId}' is not in the manifest — nothing to do.`,
    );
    return {
      pluginId: opts.pluginId,
      entry: undefined,
      schemaFile: undefined,
      dropStatements: [],
      messages,
    };
  }

  messages.push(`[shopverse] plugin: ${entry.id}`);
  messages.push(`[shopverse]   source:        ${entry.source}`);
  if (entry.workspacePath) {
    messages.push(`[shopverse]   workspace:     ${entry.workspacePath}`);
  }
  messages.push(`[shopverse]   enabled:       ${entry.enabled}`);
  messages.push('');
  messages.push(
    `To stop loading this plugin, remove (or comment out) the corresponding`,
  );
  messages.push(
    `entry from \`backend/plugins.config.ts\` and rebuild your container.`,
  );

  if (!opts.dropData) {
    messages.push('');
    messages.push(
      `Data preserved. Re-add the manifest entry later to re-enable.`,
    );
    messages.push(
      `Re-run with --drop-data to print the DROP statements for the`,
    );
    messages.push(`plugin's tables.`);
    return {
      pluginId: opts.pluginId,
      entry,
      schemaFile: undefined,
      dropStatements: [],
      messages,
    };
  }

  // --drop-data: derive DROP statements from the plugin's schema file.
  const schema = readPluginSchema(repoRoot, entry);
  if (!schema) {
    messages.push('');
    messages.push(
      `[shopverse] no schema file at prisma/schema/<plugin>.prisma — nothing to drop.`,
    );
    return {
      pluginId: opts.pluginId,
      entry,
      schemaFile: undefined,
      dropStatements: [],
      messages,
    };
  }

  const drops = schema.models.map((m) => `DROP TABLE IF EXISTS "${m}" CASCADE;`);
  messages.push('');
  messages.push(
    `[shopverse] schema file: ${path.relative(repoRoot, schema.file)}`,
  );
  messages.push(`[shopverse] ${schema.models.length} model(s) to drop:`);
  for (const m of schema.models) {
    messages.push(`  - ${m}`);
  }
  messages.push('');
  messages.push(`Run these DROP statements against your database:`);
  messages.push('');
  for (const sql of drops) {
    messages.push(sql);
  }
  messages.push('');
  messages.push(
    `For local dev: \`npx prisma db execute --schema prisma/schema --stdin\``,
  );
  messages.push(`For production: roll a follow-up Prisma migration with`);
  messages.push(`these statements so the change is replayable.`);

  return {
    pluginId: opts.pluginId,
    entry,
    schemaFile: schema.file,
    dropStatements: drops,
    messages,
  };
}

export function runUninstall(opts: UninstallOptions): number {
  const result = planUninstall(opts);
  for (const line of result.messages) {
    console.log(line);
  }
  return result.entry ? 0 : 2;
}
