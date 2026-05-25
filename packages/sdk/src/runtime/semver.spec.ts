// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { parseSemver, satisfies } from './semver';

describe('parseSemver', () => {
  it('parses well-formed semver', () => {
    expect(parseSemver('1.2.3')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: null,
    });
  });

  it('captures pre-release tags', () => {
    expect(parseSemver('0.1.0-alpha.1')).toEqual({
      major: 0,
      minor: 1,
      patch: 0,
      prerelease: 'alpha.1',
    });
  });

  it('rejects malformed input', () => {
    expect(parseSemver('1.2')).toBeNull();
    expect(parseSemver('v1.2.3')).toBeNull();
    expect(parseSemver('1.2.3.4')).toBeNull();
    expect(parseSemver('')).toBeNull();
  });
});

describe('satisfies', () => {
  describe('wildcard', () => {
    it('* matches anything', () => {
      expect(satisfies('0.1.0', '*')).toBe(true);
      expect(satisfies('99.99.99', '*')).toBe(true);
    });
  });

  describe('exact', () => {
    it('matches identical', () => {
      expect(satisfies('1.2.3', '1.2.3')).toBe(true);
    });
    it('rejects different', () => {
      expect(satisfies('1.2.3', '1.2.4')).toBe(false);
      expect(satisfies('1.2.3', '1.3.3')).toBe(false);
    });
  });

  describe('caret (^) — major >= 1', () => {
    it('pins major; minor and patch can grow', () => {
      expect(satisfies('1.2.3', '^1.0.0')).toBe(true);
      expect(satisfies('1.9.9', '^1.0.0')).toBe(true);
      expect(satisfies('2.0.0', '^1.0.0')).toBe(false);
      expect(satisfies('0.9.9', '^1.0.0')).toBe(false);
    });
  });

  describe('caret (^) — major = 0', () => {
    it('pins MINOR when major is 0', () => {
      expect(satisfies('0.2.3', '^0.2.0')).toBe(true);
      expect(satisfies('0.2.9', '^0.2.0')).toBe(true);
      expect(satisfies('0.3.0', '^0.2.0')).toBe(false);
      expect(satisfies('0.1.0', '^0.2.0')).toBe(false);
    });
    it('pins PATCH when major and minor are 0', () => {
      expect(satisfies('0.0.3', '^0.0.3')).toBe(true);
      expect(satisfies('0.0.4', '^0.0.3')).toBe(false);
    });
  });

  describe('tilde (~)', () => {
    it('pins major+minor; patch can grow', () => {
      expect(satisfies('1.2.3', '~1.2.0')).toBe(true);
      expect(satisfies('1.2.9', '~1.2.0')).toBe(true);
      expect(satisfies('1.3.0', '~1.2.0')).toBe(false);
      expect(satisfies('1.1.9', '~1.2.0')).toBe(false);
    });
  });

  describe('malformed range', () => {
    it('returns false for unsupported syntax', () => {
      expect(satisfies('1.2.3', '>=1.0.0')).toBe(false);
      expect(satisfies('1.2.3', '1.x')).toBe(false);
      expect(satisfies('1.2.3', '')).toBe(false);
    });
  });
});
