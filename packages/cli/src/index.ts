// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * @shopverse/cli — plugin tooling library entrypoint.
 *
 * The bin entrypoint is `dist/cli.js` (see package.json `bin`). This
 * file exports the same primitives as a library so callers (CI, custom
 * deploy scripts, the future create-shopverse-plugin scaffolder) can
 * embed the migration runner without spawning a subprocess.
 */

export {
  DefaultMigrationRunner,
  migrateAll,
  allSucceeded,
} from './migrate';
export type {
  MigrationRunner,
  PluginMigrationResult,
} from './migrate';
export { auditMatrix, formatReport, runAudit } from './audit';
export type { AuditCounts, AuditOptions, AuditResult } from './audit';
export { planUninstall, runUninstall } from './uninstall';
export type { UninstallOptions, UninstallResult } from './uninstall';
export { seedAll, formatSeedReport, allSucceededSeed } from './seed';
export type {
  SeedContext,
  PluginSeedFn,
  SeedRunOptions,
  SeedResult,
} from './seed';
