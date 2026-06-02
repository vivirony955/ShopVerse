// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * W6.T12 — `shopverse audit:completeness` script (plan §11.11).
 *
 * Reads `cross-cutting/COMPLETENESS_MATRIX.md`, classifies every
 * markdown table row by status, prints a summary, and exits non-zero
 * when the programme is not done.
 *
 * Status taxonomy (matrix authors use these strings, sometimes with
 * a trailing qualifier like `verified-by-equivalence` or
 * `verified via W4.CI1`):
 *
 *   verified                    — fully complete
 *   verified-by-equivalence     — closed via a different artefact
 *   verified-as-scaffold        — shape shipped; runtime activation deferred
 *   verified via <ref>          — closed by another task
 *   verified-by-design          — analytic verification, no runtime gate
 *   complete                    — code merged, not yet validation-gated
 *   in_progress                 — work started, not complete
 *   pending                     — not yet started
 *   blocked                     — work paused on external input
 *   rolled forward → <wave>     — explicitly moved to a later wave
 *   deferred → <ref>            — explicit re-schedule
 *
 * In `default` (loose) mode, the `verified*` family all count as
 * verified — the matrix author has decided the row is closed even
 * if the verification is indirect. In `strict` mode, only literal
 * `verified` counts; the others are flagged as not-strictly-verified.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface AuditCounts {
  total: number;
  verified: number;
  verifiedLoose: number;
  pending: number;
  inProgress: number;
  blocked: number;
  rolledOrDeferred: number;
  unrecognised: number;
}

export interface AuditOptions {
  matrixPath: string;
  strict?: boolean;
}

export interface AuditResult {
  counts: AuditCounts;
  // Surfaced details for the human-facing report (truncated; full
  // list available via .rows).
  rows: ReadonlyArray<{
    line: number;
    taskId: string | undefined;
    statusToken: string;
    rawLine: string;
  }>;
}

function classifyStatusToken(token: string): {
  isVerified: boolean;
  isVerifiedLoose: boolean;
  isPending: boolean;
  isInProgress: boolean;
  isBlocked: boolean;
  isRolledOrDeferred: boolean;
} {
  const t = token.toLowerCase().trim();
  // `verified` (strict)
  if (t === 'verified') {
    return {
      isVerified: true,
      isVerifiedLoose: true,
      isPending: false,
      isInProgress: false,
      isBlocked: false,
      isRolledOrDeferred: false,
    };
  }
  // `verified*` family (loose)
  if (
    t.startsWith('verified-') ||
    t.startsWith('verified via') ||
    t.startsWith('verified by') ||
    t.includes(' verified')
  ) {
    return {
      isVerified: false,
      isVerifiedLoose: true,
      isPending: false,
      isInProgress: false,
      isBlocked: false,
      isRolledOrDeferred: false,
    };
  }
  if (t === 'pending') {
    return {
      isVerified: false,
      isVerifiedLoose: false,
      isPending: true,
      isInProgress: false,
      isBlocked: false,
      isRolledOrDeferred: false,
    };
  }
  if (t === 'in_progress' || t === 'in progress') {
    return {
      isVerified: false,
      isVerifiedLoose: false,
      isPending: false,
      isInProgress: true,
      isBlocked: false,
      isRolledOrDeferred: false,
    };
  }
  if (t === 'blocked') {
    return {
      isVerified: false,
      isVerifiedLoose: false,
      isPending: false,
      isInProgress: false,
      isBlocked: true,
      isRolledOrDeferred: false,
    };
  }
  if (
    t.startsWith('rolled forward') ||
    t.startsWith('rolled →') ||
    t.startsWith('rolled') ||
    t.startsWith('deferred')
  ) {
    return {
      isVerified: false,
      isVerifiedLoose: false,
      isPending: false,
      isInProgress: false,
      isBlocked: false,
      isRolledOrDeferred: true,
    };
  }
  return {
    isVerified: false,
    isVerifiedLoose: false,
    isPending: false,
    isInProgress: false,
    isBlocked: false,
    isRolledOrDeferred: false,
  };
}

const TASK_ID_PATTERN = /(W\d+\.(?:T\d+|CI\d+|D\d+|T-[\w-]+))/;
const SECTION_HEADER_PATTERN = /^##\s+Wave\s+\d+/i;
const TABLE_HEADER_OR_SEPARATOR =
  /^\|\s*(plan\s*ref|--+\s*\|)/i;

/**
 * Parse the matrix file. Returns counts + per-row records.
 *
 * Algorithm:
 *   1. Walk every line.
 *   2. Tracks "inside a Wave section" so we ignore the
 *      header/intro markdown that appears before the first wave
 *      table.
 *   3. For each `|`-delimited line that is NOT a header /
 *      separator, find the status token by classifying every
 *      pipe-separated cell — the first cell whose lowercased
 *      content matches a known status word wins.
 *   4. Aggregate.
 */
export function auditMatrix(opts: AuditOptions): AuditResult {
  const raw = fs.readFileSync(opts.matrixPath, 'utf8');
  const lines = raw.split('\n');
  const rows: AuditResult['rows'][number][] = [];
  let inWaveSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (SECTION_HEADER_PATTERN.test(line)) {
      inWaveSection = true;
      continue;
    }
    if (!inWaveSection) continue;
    if (!line.trim().startsWith('|')) continue;
    if (TABLE_HEADER_OR_SEPARATOR.test(line)) continue;

    // Split cells. Drop leading/trailing empties from the outer pipes.
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

    let statusToken: string | undefined;
    for (const cell of cells) {
      const cls = classifyStatusToken(cell);
      if (
        cls.isVerified ||
        cls.isVerifiedLoose ||
        cls.isPending ||
        cls.isInProgress ||
        cls.isBlocked ||
        cls.isRolledOrDeferred
      ) {
        statusToken = cell;
        break;
      }
    }
    if (!statusToken) {
      // Some matrix rows put status + sha in a single cell (e.g.
      // W4 schema: "W4.CI1 verified"). Re-scan with a per-cell
      // token sweep.
      for (const cell of cells) {
        const m = cell
          .toLowerCase()
          .match(
            /(verified[\w \-]*|pending|in_progress|blocked|rolled forward|deferred)/,
          );
        if (m) {
          statusToken = m[1];
          break;
        }
      }
    }
    if (!statusToken) continue;

    const idMatch = line.match(TASK_ID_PATTERN);
    rows.push({
      line: i + 1,
      taskId: idMatch?.[1],
      statusToken,
      rawLine: line,
    });
  }

  const counts: AuditCounts = {
    total: rows.length,
    verified: 0,
    verifiedLoose: 0,
    pending: 0,
    inProgress: 0,
    blocked: 0,
    rolledOrDeferred: 0,
    unrecognised: 0,
  };
  for (const r of rows) {
    const c = classifyStatusToken(r.statusToken);
    if (c.isVerified) {
      counts.verified++;
      counts.verifiedLoose++;
    } else if (c.isVerifiedLoose) {
      counts.verifiedLoose++;
    } else if (c.isPending) counts.pending++;
    else if (c.isInProgress) counts.inProgress++;
    else if (c.isBlocked) counts.blocked++;
    else if (c.isRolledOrDeferred) counts.rolledOrDeferred++;
    else counts.unrecognised++;
  }

  return { counts, rows };
}

export function formatReport(result: AuditResult, opts: AuditOptions): string {
  const c = result.counts;
  const accountedFor =
    c.verifiedLoose +
    c.pending +
    c.inProgress +
    c.blocked +
    c.rolledOrDeferred +
    c.unrecognised;
  const lines: string[] = [];
  lines.push(`Reading ${path.basename(opts.matrixPath)} ...`);
  lines.push(`  Total plan items:           ${c.total}`);
  lines.push(`  Verified (strict):          ${c.verified}`);
  lines.push(`  Verified (loose, includes`);
  lines.push(`    -by-equivalence /`);
  lines.push(`    -as-scaffold / via X):    ${c.verifiedLoose}`);
  lines.push(`  Pending:                    ${c.pending}`);
  lines.push(`  In-progress:                ${c.inProgress}`);
  lines.push(`  Blocked:                    ${c.blocked}`);
  lines.push(`  Rolled / Deferred:          ${c.rolledOrDeferred}`);
  if (c.unrecognised > 0) {
    lines.push(`  Unrecognised status:        ${c.unrecognised}`);
  }
  if (accountedFor !== c.total) {
    lines.push(`  (status sum ${accountedFor} ≠ total ${c.total} — review)`);
  }

  const doneCount = opts.strict ? c.verified : c.verifiedLoose;
  const isDone = doneCount === c.total && c.unrecognised === 0;
  lines.push('');
  if (isDone) {
    lines.push('✅ Architecture evolution complete.');
  } else {
    const mode = opts.strict ? 'strict' : 'loose';
    lines.push(
      `❌ NOT COMPLETE — ${c.total - doneCount} plan item(s) outstanding (${mode} mode).`,
    );
    if (c.rolledOrDeferred > 0) {
      lines.push(
        `   ${c.rolledOrDeferred} item(s) explicitly rolled forward / deferred — see matrix for target wave.`,
      );
    }
    if (c.pending + c.inProgress + c.blocked > 0) {
      lines.push(
        `   ${c.pending + c.inProgress + c.blocked} item(s) active (pending/in-progress/blocked).`,
      );
    }
  }
  return lines.join('\n');
}

/**
 * CLI entry. Returns an exit code; the caller is responsible for
 * invoking `process.exit`.
 */
export function runAudit(opts: AuditOptions): number {
  const result = auditMatrix(opts);
  console.log(formatReport(result, opts));
  const doneCount = opts.strict
    ? result.counts.verified
    : result.counts.verifiedLoose;
  const isDone = doneCount === result.counts.total && result.counts.unrecognised === 0;
  return isDone ? 0 : 1;
}
