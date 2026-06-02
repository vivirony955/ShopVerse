// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import {
  assertScope,
  coversScope,
  DEFAULT_PLUGIN_SCOPES,
  findForbiddenScopes,
  hasScope,
  PluginScopeError,
} from './scope-checker';

describe('coversScope', () => {
  it('exact match', () => {
    expect(coversScope('orders:read', 'orders:read')).toBe(true);
  });
  it('different resource — no', () => {
    expect(coversScope('orders:read', 'wallet:read')).toBe(false);
  });
  it('resource wildcard', () => {
    expect(coversScope('orders:*', 'orders:read')).toBe(true);
    expect(coversScope('orders:*', 'orders:write')).toBe(true);
  });
  it('write implies read', () => {
    expect(coversScope('orders:write', 'orders:read')).toBe(true);
    expect(coversScope('orders:read', 'orders:write')).toBe(false);
  });
  it('global wildcard', () => {
    expect(coversScope('*', 'anything:weird')).toBe(true);
  });
});

describe('assertScope', () => {
  it('passes when scope covered', () => {
    expect(() => assertScope('p1', 'orders:read', ['orders:read'])).not.toThrow();
  });
  it('throws PluginScopeError otherwise', () => {
    expect(() => assertScope('p1', 'wallet:read', ['orders:read'])).toThrow(
      PluginScopeError,
    );
  });
  it('mentions the required scope in message', () => {
    try {
      assertScope('@shopverse/foo', 'wallet:write', []);
      fail('expected throw');
    } catch (err) {
      expect((err as Error).message).toContain('wallet:write');
      expect((err as Error).message).toContain('@shopverse/foo');
    }
  });
});

describe('hasScope', () => {
  it('non-throwing', () => {
    expect(hasScope('orders:read', ['orders:read'])).toBe(true);
    expect(hasScope('wallet:read', ['orders:read'])).toBe(false);
  });
});

describe('findForbiddenScopes', () => {
  it('rejects "*"', () => {
    expect(findForbiddenScopes(['*'])).toEqual(['*']);
  });
  it('rejects admin:*', () => {
    expect(findForbiddenScopes(['admin:*'])).toEqual(['admin:*']);
  });
  it('rejects wallet:write', () => {
    expect(findForbiddenScopes(['wallet:write'])).toEqual(['wallet:write']);
  });
  it('allows benign scopes', () => {
    expect(findForbiddenScopes(['orders:read', 'wallet:read'])).toEqual([]);
  });
});

describe('DEFAULT_PLUGIN_SCOPES', () => {
  it('contains only read scopes', () => {
    for (const s of DEFAULT_PLUGIN_SCOPES) {
      expect(s.endsWith(':read')).toBe(true);
    }
  });
});
