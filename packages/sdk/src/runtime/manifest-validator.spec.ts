// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  assertValidManifest,
  checkKernelVersion,
  validateManifest,
} from './manifest-validator';

const good = {
  kernelVersion: '0.1.0',
  plugins: [
    {
      id: '@shopverse/plugin-foo',
      source: 'npm' as const,
      enabled: true,
    },
  ],
};

describe('validateManifest', () => {
  it('accepts a minimal valid manifest', () => {
    const r = validateManifest(good);
    expect(r.ok).toBe(true);
  });

  it('rejects non-object input', () => {
    const r = validateManifest('hello');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0].path).toBe('$');
    }
  });

  it('rejects missing kernelVersion', () => {
    const r = validateManifest({ plugins: [] });
    expect(r.ok).toBe(false);
  });

  it('rejects unparseable kernelVersion', () => {
    const r = validateManifest({ kernelVersion: 'v1', plugins: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.path === 'kernelVersion')).toBe(true);
    }
  });

  it('rejects missing plugins[]', () => {
    const r = validateManifest({ kernelVersion: '0.1.0' });
    expect(r.ok).toBe(false);
  });

  it('rejects entry without id', () => {
    const r = validateManifest({
      kernelVersion: '0.1.0',
      plugins: [{ source: 'npm', enabled: true }],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects duplicate ids', () => {
    const r = validateManifest({
      kernelVersion: '0.1.0',
      plugins: [
        { id: 'a', source: 'npm', enabled: true },
        { id: 'a', source: 'npm', enabled: true },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.message.includes('Duplicate'))).toBe(true);
    }
  });

  it('rejects workspace source without workspacePath', () => {
    const r = validateManifest({
      kernelVersion: '0.1.0',
      plugins: [{ id: 'x', source: 'workspace', enabled: true }],
    });
    expect(r.ok).toBe(false);
  });

  it('accepts workspace with path', () => {
    const r = validateManifest({
      kernelVersion: '0.1.0',
      plugins: [
        {
          id: 'x',
          source: 'workspace',
          workspacePath: './local-plugins/x',
          enabled: true,
        },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it('rejects bad source value', () => {
    const r = validateManifest({
      kernelVersion: '0.1.0',
      plugins: [{ id: 'x', source: 'github', enabled: true }],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects bad dbConcurrency', () => {
    const r = validateManifest({
      kernelVersion: '0.1.0',
      plugins: [
        {
          id: 'x',
          source: 'npm',
          enabled: true,
          config: { dbConcurrency: 50 },
        },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it('accepts valid dbConcurrency', () => {
    const r = validateManifest({
      kernelVersion: '0.1.0',
      plugins: [
        {
          id: 'x',
          source: 'npm',
          enabled: true,
          config: { dbConcurrency: 5 },
        },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it('rejects forbidden scopes (admin:*)', () => {
    const r = validateManifest({
      kernelVersion: '0.1.0',
      plugins: [
        {
          id: 'x',
          source: 'npm',
          enabled: true,
          config: { scopes: ['admin:*', 'orders:read'] },
        },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.message.includes('admin:*'))).toBe(true);
    }
  });

  it('rejects bad scopes type', () => {
    const r = validateManifest({
      kernelVersion: '0.1.0',
      plugins: [
        {
          id: 'x',
          source: 'npm',
          enabled: true,
          config: { scopes: ['orders:read', 42] },
        },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects Sentry sampleRate outside [0, 1]', () => {
    const r = validateManifest({
      kernelVersion: '0.1.0',
      plugins: [
        {
          id: 'x',
          source: 'npm',
          enabled: true,
          config: { sentry: { sampleRate: 2 } },
        },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects cron under 5-minute interval (rule #9)', () => {
    const r = validateManifest({
      kernelVersion: '0.1.0',
      plugins: [
        {
          id: 'x',
          source: 'npm',
          enabled: true,
          config: { cron: { name: 'sync', intervalMinutes: 1 } },
        },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.message.includes('anti-storm'))).toBe(true);
    }
  });

  it('accepts cron at the 5-minute floor', () => {
    const r = validateManifest({
      kernelVersion: '0.1.0',
      plugins: [
        {
          id: 'x',
          source: 'npm',
          enabled: true,
          config: { cron: { name: 'sync', intervalMinutes: 5 } },
        },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it('rejects cron missing name', () => {
    const r = validateManifest({
      kernelVersion: '0.1.0',
      plugins: [
        {
          id: 'x',
          source: 'npm',
          enabled: true,
          config: { cron: { intervalMinutes: 10 } },
        },
      ],
    });
    expect(r.ok).toBe(false);
  });
});

describe('assertValidManifest', () => {
  it('throws on invalid manifest', () => {
    expect(() => assertValidManifest({ kernelVersion: 'bad', plugins: [] })).toThrow(
      /Invalid plugins\.config\.ts/,
    );
  });
  it('does not throw on valid manifest', () => {
    expect(() => assertValidManifest(good)).not.toThrow();
  });
});

describe('checkKernelVersion', () => {
  it('caret range across kernel patch bump', () => {
    expect(checkKernelVersion('^0.1.0', '0.1.5')).toBe(true);
    expect(checkKernelVersion('^0.1.0', '0.2.0')).toBe(false);
  });
  it('rejects future major', () => {
    expect(checkKernelVersion('^1.0.0', '2.0.0')).toBe(false);
  });
});
