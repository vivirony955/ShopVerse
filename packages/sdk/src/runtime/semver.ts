// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * Minimal semver matcher (plan §10 E3).
 *
 * The SDK is intentionally zero-dep, so we implement just the subset of
 * semver-range syntax the kernelVersion field uses:
 *
 *   - exact:     "1.2.3"
 *   - caret:     "^1.2.3"   matches >=1.2.3 <2.0.0  (for major>=1)
 *                "^0.2.3"   matches >=0.2.3 <0.3.0  (caret pins minor when major=0)
 *                "^0.0.3"   matches  =0.0.3         (caret pins patch when major=minor=0)
 *   - tilde:     "~1.2.3"   matches >=1.2.3 <1.3.0
 *   - wildcard:  "*"        matches anything
 *
 * Anything else returns false. Callers are expected to keep their range
 * declarations to the supported forms; the kernel boot logs a WARN if it
 * sees an unrecognised range.
 */

export interface SemverParts {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /** Pre-release tag (e.g. 'alpha.1') — stripped from compare. */
  readonly prerelease: string | null;
}

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function parseSemver(version: string): SemverParts | null {
  const m = SEMVER_RE.exec(version);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ?? null,
  };
}

/** Returns negative/zero/positive a vs b — ignores prerelease tag. */
function compare(a: SemverParts, b: SemverParts): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/**
 * Returns true if `version` satisfies `range`. Supports exact, caret,
 * tilde, and `*`. Anything else returns false.
 *
 * Pre-release tags on `version` (e.g. `0.1.0-alpha.1`) currently match
 * against the base triple, which is consistent with npm's "prereleases
 * only allowed if explicitly opted-in" rule applied here as
 * "prereleases match the base release of the same triple". Sufficient
 * for our boot-time check; we don't need full semver semantics.
 */
export function satisfies(version: string, range: string): boolean {
  const ver = parseSemver(version);
  if (!ver) return false;

  const trimmed = range.trim();
  if (trimmed === '*') return true;

  if (trimmed.startsWith('^')) {
    const base = parseSemver(trimmed.slice(1));
    if (!base) return false;
    if (compare(ver, base) < 0) return false;
    if (base.major > 0) return ver.major === base.major;
    if (base.minor > 0) return ver.major === 0 && ver.minor === base.minor;
    return (
      ver.major === 0 && ver.minor === 0 && ver.patch === base.patch
    );
  }

  if (trimmed.startsWith('~')) {
    const base = parseSemver(trimmed.slice(1));
    if (!base) return false;
    if (compare(ver, base) < 0) return false;
    return ver.major === base.major && ver.minor === base.minor;
  }

  // Exact match.
  const exact = parseSemver(trimmed);
  if (!exact) return false;
  return compare(ver, exact) === 0;
}
