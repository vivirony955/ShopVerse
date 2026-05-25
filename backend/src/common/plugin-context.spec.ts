// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  _resetPluginContextForTests,
  currentPluginId,
  getPluginSentryRate,
  runInPluginContext,
  setPluginSentryRate,
  shouldSendPluginEvent,
} from './plugin-context';

describe('plugin-context', () => {
  beforeEach(() => {
    _resetPluginContextForTests();
  });

  describe('runInPluginContext / currentPluginId', () => {
    it('attributes synchronously', () => {
      expect(currentPluginId()).toBeNull();
      const out = runInPluginContext('@shopverse/foo', () => currentPluginId());
      expect(out).toBe('@shopverse/foo');
      expect(currentPluginId()).toBeNull(); // cleared after
    });

    it('survives async/await within fn', async () => {
      const id = await runInPluginContext('@shopverse/foo', async () => {
        await new Promise((r) => setImmediate(r));
        return currentPluginId();
      });
      expect(id).toBe('@shopverse/foo');
    });

    it('nests correctly (inner wins, outer restored on exit)', () => {
      runInPluginContext('outer', () => {
        expect(currentPluginId()).toBe('outer');
        runInPluginContext('inner', () => {
          expect(currentPluginId()).toBe('inner');
        });
        expect(currentPluginId()).toBe('outer');
      });
    });

    it('clears even if fn throws', () => {
      expect(() =>
        runInPluginContext('throws', () => {
          throw new Error('boom');
        }),
      ).toThrow('boom');
      expect(currentPluginId()).toBeNull();
    });
  });

  describe('setPluginSentryRate / getPluginSentryRate', () => {
    it('defaults to 1.0', () => {
      expect(getPluginSentryRate('any')).toBe(1.0);
    });
    it('persists a set rate', () => {
      setPluginSentryRate('p1', 0.05);
      expect(getPluginSentryRate('p1')).toBe(0.05);
    });
    it('rejects out-of-range rate', () => {
      expect(() => setPluginSentryRate('p1', -0.1)).toThrow();
      expect(() => setPluginSentryRate('p1', 1.5)).toThrow();
      expect(() => setPluginSentryRate('p1', Number.NaN)).toThrow();
    });
  });

  describe('shouldSendPluginEvent', () => {
    it('always sends at rate 1.0', () => {
      expect(shouldSendPluginEvent('default')).toBe(true);
    });
    it('never sends at rate 0', () => {
      setPluginSentryRate('quiet', 0);
      expect(shouldSendPluginEvent('quiet')).toBe(false);
    });
    it('uses rng for partial rates', () => {
      setPluginSentryRate('half', 0.5);
      expect(shouldSendPluginEvent('half', () => 0.4)).toBe(true);
      expect(shouldSendPluginEvent('half', () => 0.6)).toBe(false);
    });
  });
});
