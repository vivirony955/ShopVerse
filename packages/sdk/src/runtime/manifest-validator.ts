// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * PluginManifest validator (plan §10 E1, E3, E12).
 *
 * Pure function — no I/O, no Node primitives, importable from both
 * kernel and plugin test suites. The kernel calls this at boot before
 * instantiating any plugin; CI calls it to validate `plugins.config.ts`.
 *
 * Returns a discriminated `ValidationResult` so callers handle errors
 * explicitly instead of catching exceptions.
 */

import type { PluginManifest, PluginManifestEntry } from '../contracts/plugin';
import { parseSemver, satisfies } from './semver';

export interface ValidationIssue {
  readonly path: string; // e.g. 'plugins[2].id'
  readonly message: string;
  readonly severity: 'error' | 'warning';
}

export type ValidationResult =
  | { readonly ok: true; readonly warnings: readonly ValidationIssue[] }
  | { readonly ok: false; readonly errors: readonly ValidationIssue[]; readonly warnings: readonly ValidationIssue[] };

// Bare minimum required by E12: declared scopes must be strings.
const VALID_DB_CONCURRENCY_RANGE = { min: 1, max: 10 } as const;
const CRON_MIN_INTERVAL_MINUTES = 5;

/**
 * Validate a manifest object. The manifest comes from user code
 * (`plugins.config.ts`) so we make no assumptions about its shape until
 * checked.
 */
export function validateManifest(input: unknown): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (typeof input !== 'object' || input === null) {
    return {
      ok: false,
      errors: [{ path: '$', message: 'Manifest must be an object', severity: 'error' }],
      warnings: [],
    };
  }

  const manifest = input as Partial<PluginManifest>;

  // kernelVersion (top-level) — required, must be parseable.
  if (typeof manifest.kernelVersion !== 'string') {
    errors.push({
      path: 'kernelVersion',
      message: 'Missing or non-string kernelVersion',
      severity: 'error',
    });
  } else if (!parseSemver(manifest.kernelVersion)) {
    // Top-level kernelVersion is the EXPECTED kernel version (exact), not
    // a range — used by deployment tools to pin the kernel build.
    errors.push({
      path: 'kernelVersion',
      message: `Invalid semver: "${manifest.kernelVersion}"`,
      severity: 'error',
    });
  }

  if (!Array.isArray(manifest.plugins)) {
    errors.push({
      path: 'plugins',
      message: 'Missing or non-array plugins[]',
      severity: 'error',
    });
    return { ok: false, errors, warnings };
  }

  const seenIds = new Set<string>();
  manifest.plugins.forEach((entry, idx) => {
    validateEntry(entry, `plugins[${idx}]`, errors, warnings, seenIds);
  });

  return errors.length === 0
    ? { ok: true, warnings }
    : { ok: false, errors, warnings };
}

function validateEntry(
  raw: unknown,
  path: string,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
  seenIds: Set<string>,
): void {
  if (typeof raw !== 'object' || raw === null) {
    errors.push({ path, message: 'Plugin entry must be an object', severity: 'error' });
    return;
  }

  const entry = raw as Partial<PluginManifestEntry>;

  if (typeof entry.id !== 'string' || entry.id.length === 0) {
    errors.push({ path: `${path}.id`, message: 'id is required and must be a non-empty string', severity: 'error' });
  } else if (seenIds.has(entry.id)) {
    errors.push({ path: `${path}.id`, message: `Duplicate plugin id: "${entry.id}"`, severity: 'error' });
  } else {
    seenIds.add(entry.id);
  }

  if (entry.source !== 'npm' && entry.source !== 'workspace') {
    errors.push({ path: `${path}.source`, message: 'source must be "npm" or "workspace"', severity: 'error' });
  }

  if (entry.source === 'workspace' && typeof entry.workspacePath !== 'string') {
    errors.push({
      path: `${path}.workspacePath`,
      message: 'workspacePath is required when source is "workspace"',
      severity: 'error',
    });
  }

  if (typeof entry.enabled !== 'boolean') {
    errors.push({ path: `${path}.enabled`, message: 'enabled is required (boolean)', severity: 'error' });
  }

  if (entry.config !== undefined) {
    validateConfig(entry.config, `${path}.config`, errors, warnings);
  }
}

function validateConfig(
  raw: unknown,
  path: string,
  errors: ValidationIssue[],
  _warnings: ValidationIssue[],
): void {
  if (typeof raw !== 'object' || raw === null) {
    errors.push({ path, message: 'config must be an object when present', severity: 'error' });
    return;
  }
  const cfg = raw as Record<string, unknown>;

  // E7 — DB concurrency cap.
  if (cfg.dbConcurrency !== undefined) {
    if (
      typeof cfg.dbConcurrency !== 'number' ||
      !Number.isInteger(cfg.dbConcurrency) ||
      cfg.dbConcurrency < VALID_DB_CONCURRENCY_RANGE.min ||
      cfg.dbConcurrency > VALID_DB_CONCURRENCY_RANGE.max
    ) {
      errors.push({
        path: `${path}.dbConcurrency`,
        message: `dbConcurrency must be an integer in [${VALID_DB_CONCURRENCY_RANGE.min}, ${VALID_DB_CONCURRENCY_RANGE.max}]`,
        severity: 'error',
      });
    }
  }

  // E12 — authz scopes.
  if (cfg.scopes !== undefined) {
    if (!Array.isArray(cfg.scopes) || cfg.scopes.some((s) => typeof s !== 'string')) {
      errors.push({
        path: `${path}.scopes`,
        message: 'scopes must be an array of strings',
        severity: 'error',
      });
    }
  }

  // E15 — per-plugin Sentry sample rate.
  if (cfg.sentry !== undefined) {
    const sentry = cfg.sentry as Record<string, unknown>;
    if (sentry.sampleRate !== undefined) {
      const r = sentry.sampleRate;
      if (typeof r !== 'number' || r < 0 || r > 1) {
        errors.push({
          path: `${path}.sentry.sampleRate`,
          message: 'sentry.sampleRate must be a number in [0, 1]',
          severity: 'error',
        });
      }
    }
  }

  // §5 rule #9 — at most one cron per plugin, min 5-minute interval.
  if (cfg.cron !== undefined) {
    validateCron(cfg.cron, `${path}.cron`, errors);
  }
}

function validateCron(raw: unknown, path: string, errors: ValidationIssue[]): void {
  if (typeof raw !== 'object' || raw === null) {
    errors.push({ path, message: 'cron must be an object', severity: 'error' });
    return;
  }
  const cron = raw as Record<string, unknown>;
  if (typeof cron.name !== 'string' || cron.name.length === 0) {
    errors.push({ path: `${path}.name`, message: 'cron.name is required', severity: 'error' });
  }
  if (typeof cron.intervalMinutes !== 'number' || !Number.isInteger(cron.intervalMinutes)) {
    errors.push({
      path: `${path}.intervalMinutes`,
      message: 'cron.intervalMinutes must be an integer',
      severity: 'error',
    });
    return;
  }
  if (cron.intervalMinutes < CRON_MIN_INTERVAL_MINUTES) {
    errors.push({
      path: `${path}.intervalMinutes`,
      message: `cron.intervalMinutes must be >= ${CRON_MIN_INTERVAL_MINUTES} (anti-storm rule)`,
      severity: 'error',
    });
  }
}

/**
 * Convenience: throws on validation failure. Use when callers want
 * fail-fast at boot (kernel) rather than collecting issues for a UI.
 */
export function assertValidManifest(input: unknown): asserts input is PluginManifest {
  const result = validateManifest(input);
  if (!result.ok) {
    const lines = result.errors.map((e) => `  - ${e.path}: ${e.message}`).join('\n');
    throw new Error(`Invalid plugins.config.ts:\n${lines}`);
  }
}

/**
 * E3 — verify a plugin's declared kernelVersion range against the current
 * kernel version. Returns true if compatible.
 */
export function checkKernelVersion(pluginRange: string, currentKernel: string): boolean {
  return satisfies(currentKernel, pluginRange);
}
