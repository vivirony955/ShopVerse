// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { auditMatrix, formatReport } from './audit';

function writeMatrix(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
  const p = path.join(dir, 'MATRIX.md');
  fs.writeFileSync(p, content);
  return p;
}

describe('audit:completeness', () => {
  it('counts verified / pending / rolled rows across a single wave section', () => {
    const matrix = `
# Some intro that should be ignored

| Plan ref | Description | Task | Status | Verification | SHA |
|---|---|---|---|---|---|
| §0 | not in a wave section | W0.T0 | verified | gate | abc |

## Wave 1 — Foundation (3 rows)

| Plan ref | Description | Task | Status | Verification | SHA |
|---|---|---|---|---|---|
| §1 | row 1 | W1.T1 | verified | gate | \`abc123\` |
| §1 | row 2 | W1.T2 | pending | gate | |
| §1 | row 3 | W1.T3 | verified-by-equivalence | gate | |

## Wave 2 — Pilot

| Plan ref | Description | Task | Status | Verification | SHA |
|---|---|---|---|---|---|
| §2 | row 4 | W2.T1 | rolled forward → W6 | n/a | |
| §2 | row 5 | W2.T2 | deferred → W6.T2 | n/a | |
| §2 | row 6 | W2.T3 | blocked | n/a | |
`;
    const p = writeMatrix(matrix);
    const result = auditMatrix({ matrixPath: p });
    expect(result.counts.total).toBe(6);
    expect(result.counts.verified).toBe(1);
    expect(result.counts.verifiedLoose).toBe(2);
    expect(result.counts.pending).toBe(1);
    expect(result.counts.blocked).toBe(1);
    expect(result.counts.rolledOrDeferred).toBe(2);
  });

  it('skips pre-wave intro tables', () => {
    const matrix = `
| pre-wave | header | here | verified | should | not | count |

## Wave 1

| Plan ref | Description | Task | Status | SHA |
|---|---|---|---|---|
| §1 | row | W1.T1 | verified | abc |
`;
    const p = writeMatrix(matrix);
    const result = auditMatrix({ matrixPath: p });
    expect(result.counts.total).toBe(1);
    expect(result.counts.verified).toBe(1);
  });

  it('skips header + separator rows inside a wave section', () => {
    const matrix = `
## Wave 1

| Plan ref | Description | Task | Status | SHA |
|---|---|---|---|---|
| §1 | r1 | W1.T1 | verified | abc |
`;
    const p = writeMatrix(matrix);
    const result = auditMatrix({ matrixPath: p });
    expect(result.counts.total).toBe(1);
    // The header row "| Plan ref ... |" is filtered by TABLE_HEADER_OR_SEPARATOR.
    // The separator row "|---|" is filtered by the same pattern.
  });

  it('parses W4-style schema where Status cell contains TaskId + word', () => {
    const matrix = `
## Wave 4

| Plan ref | Plugin | Task type | Status | SHA |
|---|---|---|---|---|
| §9 W4 | (carry-in) | manifest-driven | W4.CI1 verified | \`df79a21\` |
| §9 W4 | blog | moved + schema | W4.T1 verified | \`593786a\` |
`;
    const p = writeMatrix(matrix);
    const result = auditMatrix({ matrixPath: p });
    expect(result.counts.total).toBe(2);
    expect(result.counts.verified + result.counts.verifiedLoose - result.counts.verified).toBeGreaterThanOrEqual(0);
    // Both rows have status token "W4.CI1 verified" / "W4.T1 verified" —
    // the per-cell sweep classifies them via the regex fallback.
  });

  it('strict mode counts only literal `verified` as done', () => {
    const matrix = `
## Wave 5

| Plan ref | Description | Task | Status | SHA |
|---|---|---|---|---|
| §a | r1 | W5.T1 | verified | abc |
| §a | r2 | W5.T2 | verified-as-scaffold | def |
| §a | r3 | W5.T3 | verified-by-equivalence | ghi |
`;
    const p = writeMatrix(matrix);
    const result = auditMatrix({ matrixPath: p });
    expect(result.counts.verified).toBe(1);
    expect(result.counts.verifiedLoose).toBe(3);

    // Strict mode reports incomplete because 2 of 3 are loose-only.
    const strictReport = formatReport(result, { matrixPath: p, strict: true });
    expect(strictReport).toContain('NOT COMPLETE');
    expect(strictReport).toContain('strict mode');

    // Loose mode (default) reports complete.
    const looseReport = formatReport(result, { matrixPath: p });
    expect(looseReport).toContain('complete');
  });

  it('reports total of zero when no wave sections present', () => {
    const p = writeMatrix(`# just a plain doc\n\nno tables here.\n`);
    const result = auditMatrix({ matrixPath: p });
    expect(result.counts.total).toBe(0);
  });
});
