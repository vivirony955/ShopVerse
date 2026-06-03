// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TelemetryService } from './telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock, MockPrisma } from '../test-utils/prisma.mock';
import { scrub } from '../observability/scrubber';
import { Heartbeat } from './telemetry.types';
import {
  ENV_DIR,
  ENV_DISABLED,
  ENV_DO_NOT_TRACK,
  ENV_ENDPOINT,
  ENV_ID,
  FIRST_BEAT_DELAY_MS,
  gmvBandOf,
  ID_FILENAME,
} from './telemetry.constants';

const ENV_KEYS = [
  'NODE_ENV',
  'npm_package_version',
  ENV_DISABLED,
  ENV_DO_NOT_TRACK,
  ENV_ID,
  ENV_DIR,
  ENV_ENDPOINT,
];

describe('TelemetryService', () => {
  let service: TelemetryService;
  let prisma: MockPrisma;
  let tmpDir: string;
  let sentBody: Heartbeat | undefined;
  let fetchMock: jest.Mock;
  let savedFetch: unknown;
  let savedEnv: Record<string, string | undefined>;
  let logSpy: jest.SpyInstance;

  beforeEach(async () => {
    savedEnv = {};
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];

    // Enabled-by-default baseline (the service is hard-off under NODE_ENV=test).
    process.env.NODE_ENV = 'production';
    delete process.env[ENV_DISABLED];
    delete process.env[ENV_DO_NOT_TRACK];
    delete process.env[ENV_ID];
    process.env[ENV_ENDPOINT] = 'https://telemetry.test/v1';

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-telemetry-'));
    process.env[ENV_DIR] = tmpDir;

    sentBody = undefined;
    fetchMock = jest.fn((_input: string, init?: { body?: string }) => {
      sentBody = init?.body ? (JSON.parse(init.body) as Heartbeat) : undefined;
      return Promise.resolve({ ok: true });
    });
    savedFetch = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = fetchMock;

    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    prisma = createPrismaMock();
    prisma.storeSettings.findUnique.mockResolvedValue({
      id: 1,
      currency: 'EUR',
      country: 'DE',
      region: 'eu',
      locale: 'de-DE',
    });
    prisma.order.aggregate.mockResolvedValue({ _sum: { total: 0 } });

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TelemetryService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get<TelemetryService>(TelemetryService);

    // Discard NestJS's own framework logs emitted during compile() so the spy
    // only counts the service's opt-out notice.
    logSpy.mockClear();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    (globalThis as { fetch?: unknown }).fetch = savedFetch;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('is defined', () => expect(service).toBeDefined());

  // ─── enablement gate ───────────────────────────────────────────────────────────

  describe('enablement', () => {
    it('sends when enabled', async () => {
      await service.sendHeartbeat();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not send when NODE_ENV=test', async () => {
      process.env.NODE_ENV = 'test';
      await service.sendHeartbeat();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not send when DO_NOT_TRACK is set', async () => {
      process.env[ENV_DO_NOT_TRACK] = '1';
      await service.sendHeartbeat();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not send when SHOPVERSE_TELEMETRY_DISABLED is truthy', async () => {
      process.env[ENV_DISABLED] = 'true';
      await service.sendHeartbeat();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // ─── payload shape ─────────────────────────────────────────────────────────────

  describe('payload', () => {
    it('mirrors store configuration and brands the edition', async () => {
      await service.sendHeartbeat();
      expect(sentBody).toBeDefined();
      expect(sentBody!.schema).toBe('shopverse.telemetry.v1');
      expect(sentBody!.edition).toBe('community');
      expect(sentBody!.store).toEqual({
        currency: 'EUR',
        country: 'DE',
        region: 'eu',
        locale: 'de-DE',
      });
      expect(sentBody!.plugins.regionPack).toBe('eu');
      expect(typeof sentBody!.plugins.enabledCount).toBe('number');
      expect(sentBody!.runtime.node).toBe(process.version);
    });

    it('falls back to global defaults when no StoreSettings row exists', async () => {
      prisma.storeSettings.findUnique.mockResolvedValue(null);
      const hb = await service.buildHeartbeat('id-1');
      expect(hb.store).toEqual({
        currency: 'USD',
        country: 'US',
        region: 'us',
        locale: 'en-US',
      });
    });

    it('uses npm_package_version when present', async () => {
      process.env.npm_package_version = '9.9.9';
      const hb = await service.buildHeartbeat('id-1');
      expect(hb.version).toBe('9.9.9');
    });
  });

  // ─── PII guarantee: scrub() must be a no-op on the payload ──────────────────────

  describe('privacy', () => {
    it('contains zero PII patterns (scrub is a no-op on the heartbeat)', async () => {
      const hb = await service.buildHeartbeat(
        '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      );
      expect(scrub(hb)).toEqual(hb);
      // The id in particular must survive untouched (install counting depends on it).
      expect(scrub(hb).anonymousId).toBe(hb.anonymousId);
    });

    it('never includes a known-PII key', async () => {
      const hb = await service.buildHeartbeat('id-1');
      const keys = JSON.stringify(hb).toLowerCase();
      for (const banned of [
        'email',
        'phone',
        'password',
        'address',
        'fullname',
      ]) {
        expect(keys).not.toContain(banned);
      }
    });
  });

  // ─── coarse GMV band ───────────────────────────────────────────────────────────

  describe('gmvBandOf', () => {
    it.each([
      [0, 'lt_1k'],
      [999, 'lt_1k'],
      [1_000, '1k_10k'],
      [9_999, '1k_10k'],
      [10_000, '10k_50k'],
      [49_999, '10k_50k'],
      [50_000, '50k_100k'],
      [99_999, '50k_100k'],
      [100_000, 'gte_100k'],
      [-5, 'unknown'],
      [Number.NaN, 'unknown'],
    ])('maps %p → %p', (total, band) => {
      expect(gmvBandOf(total)).toBe(band);
    });

    it('bands the trailing-window aggregate', async () => {
      prisma.order.aggregate.mockResolvedValue({ _sum: { total: 75_000 } });
      const hb = await service.buildHeartbeat('id-1');
      expect(hb.gmvBand).toBe('50k_100k');
    });

    it('returns unknown when the aggregate throws', async () => {
      prisma.order.aggregate.mockRejectedValue(new Error('db down'));
      const hb = await service.buildHeartbeat('id-1');
      expect(hb.gmvBand).toBe('unknown');
    });
  });

  // ─── anonymous id ──────────────────────────────────────────────────────────────

  describe('anonymous id', () => {
    it('persists a fresh id and logs the opt-out notice once', async () => {
      await service.sendHeartbeat();
      const file = path.join(tmpDir, ID_FILENAME);
      const persisted = fs.readFileSync(file, 'utf8').trim();
      expect(persisted).toBe(sentBody!.anonymousId);
      expect(logSpy).toHaveBeenCalledTimes(1);
      const calls = logSpy.mock.calls as unknown as string[][];
      expect(calls[0][0]).toContain('telemetry');

      // Second beat reuses the id and does NOT re-log the notice.
      await service.sendHeartbeat();
      expect(sentBody!.anonymousId).toBe(persisted);
      expect(logSpy).toHaveBeenCalledTimes(1);
    });

    it('honours a pinned id from the environment without writing a file', async () => {
      process.env[ENV_ID] = 'pinned-install-123';
      await service.sendHeartbeat();
      expect(sentBody!.anonymousId).toBe('pinned-install-123');
      expect(fs.existsSync(path.join(tmpDir, ID_FILENAME))).toBe(false);
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  // ─── resilience ────────────────────────────────────────────────────────────────

  describe('resilience', () => {
    it('swallows network failures', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));
      await expect(service.sendHeartbeat()).resolves.toBeUndefined();
    });

    it('swallows a StoreSettings read failure (still sends with defaults)', async () => {
      prisma.storeSettings.findUnique.mockRejectedValue(new Error('db down'));
      await service.sendHeartbeat();
      expect(sentBody!.store.currency).toBe('USD');
    });
  });

  // ─── scheduling ────────────────────────────────────────────────────────────────

  describe('scheduling', () => {
    it('does not send synchronously on bootstrap', () => {
      service.onApplicationBootstrap();
      expect(fetchMock).not.toHaveBeenCalled();
      service.onModuleDestroy(); // clears the pending timer
    });

    it('schedules a delayed first beat when enabled', () => {
      jest.useFakeTimers();
      const beat = jest
        .spyOn(service, 'sendHeartbeat')
        .mockResolvedValue(undefined);
      service.onApplicationBootstrap();
      expect(beat).not.toHaveBeenCalled();
      jest.advanceTimersByTime(FIRST_BEAT_DELAY_MS);
      expect(beat).toHaveBeenCalledTimes(1);
      service.onModuleDestroy();
    });

    it('schedules nothing when disabled', () => {
      jest.useFakeTimers();
      process.env[ENV_DISABLED] = '1';
      const beat = jest
        .spyOn(service, 'sendHeartbeat')
        .mockResolvedValue(undefined);
      service.onApplicationBootstrap();
      jest.advanceTimersByTime(FIRST_BEAT_DELAY_MS);
      expect(beat).not.toHaveBeenCalled();
    });
  });
});
