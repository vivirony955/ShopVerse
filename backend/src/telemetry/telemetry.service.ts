// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import pluginsConfig from '../../plugins.config';
import {
  DEFAULT_ENDPOINT,
  EDITION,
  ENV_DIR,
  ENV_DISABLED,
  ENV_DO_NOT_TRACK,
  ENV_ENDPOINT,
  ENV_ID,
  FIRST_BEAT_DELAY_MS,
  GMV_WINDOW_DAYS,
  GmvBand,
  gmvBandOf,
  HEARTBEAT_SCHEMA,
  ID_FILENAME,
  SEND_TIMEOUT_MS,
} from './telemetry.constants';
import { Heartbeat } from './telemetry.types';

/**
 * TelemetryService — opt-out, anonymous, fire-and-forget usage heartbeat.
 *
 * What it powers (Phase 4 capture layer): counting active installs (k-factor)
 * and a coarse "approaching the $100k gate" band for upgrade nudges — without
 * collecting any personal data. The full, audited payload is documented in
 * `docs/TELEMETRY.md` and enforced by the `Heartbeat` allowlist + a PII-oracle
 * unit test (scrub() must be a no-op on the payload).
 *
 * Trust guarantees:
 *   - OFF entirely when NODE_ENV=test, `DO_NOT_TRACK`, or
 *     `SHOPVERSE_TELEMETRY_DISABLED` is set — operator control without DB access.
 *   - The very first enabled run logs a clear notice + how to opt out.
 *   - Every DB read and network send is wrapped: telemetry can never throw,
 *     block boot, or keep the process alive (timer is unref'd).
 */
@Injectable()
export class TelemetryService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(TelemetryService.name);
  private firstBeat?: ReturnType<typeof setTimeout>;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap(): void {
    if (!this.envEnabled()) return;
    // Delay the first beat so boot is never blocked and short-lived processes
    // (migrations, CLIs, one-off scripts) exit before anything is sent.
    const timer = setTimeout(() => {
      void this.sendHeartbeat();
    }, FIRST_BEAT_DELAY_MS);
    // Never hold the event loop open for telemetry.
    if (typeof (timer as { unref?: () => void }).unref === 'function') {
      (timer as { unref: () => void }).unref();
    }
    this.firstBeat = timer;
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  handleDailyHeartbeat(): void {
    void this.sendHeartbeat();
  }

  onModuleDestroy(): void {
    if (this.firstBeat) clearTimeout(this.firstBeat);
  }

  /**
   * Build + send one heartbeat. Public so it can be triggered/inspected, but
   * self-guards on every layer: disabled → no-op; any failure → swallowed.
   */
  async sendHeartbeat(): Promise<void> {
    try {
      if (!this.envEnabled()) return;
      const { id, created } = this.resolveAnonymousId();
      if (created) this.logNotice();
      const heartbeat = await this.buildHeartbeat(id);
      await this.post(heartbeat);
    } catch {
      // Telemetry must never affect the app.
    }
  }

  /**
   * Assemble the anonymous payload. Public so operators/tests can inspect
   * exactly what would be transmitted. STRICT allowlist — see `Heartbeat`.
   */
  async buildHeartbeat(anonymousId: string): Promise<Heartbeat> {
    const store = await this.readStoreConfig();
    return {
      schema: HEARTBEAT_SCHEMA,
      anonymousId,
      sentAt: new Date().toISOString(),
      edition: EDITION,
      version: this.version(),
      runtime: {
        node: process.version,
        platform: os.platform(),
        arch: os.arch(),
      },
      store,
      gmvBand: await this.computeGmvBand(),
      plugins: {
        enabledCount: this.enabledPluginCount(),
        regionPack: store.region,
      },
    };
  }

  // ─── enablement ──────────────────────────────────────────────────────────────

  /** Hard env gate. DB/store toggles are intentionally not used (env = single,
   *  operator-controllable source of truth that works even without DB access). */
  private envEnabled(): boolean {
    if (process.env.NODE_ENV === 'test') return false;
    if (this.truthy(process.env[ENV_DO_NOT_TRACK])) return false;
    if (this.truthy(process.env[ENV_DISABLED])) return false;
    return true;
  }

  private truthy(v: string | undefined): boolean {
    if (!v) return false;
    const s = v.trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'yes' || s === 'on';
  }

  // ─── anonymous id (file-persisted, never derived from PII) ─────────────────────

  private telemetryDir(): string {
    return (
      process.env[ENV_DIR]?.trim() || path.join(process.cwd(), '.shopverse')
    );
  }

  private idFilePath(): string {
    return path.join(this.telemetryDir(), ID_FILENAME);
  }

  /** Resolve the install id; `created` is true only on a fresh install. */
  private resolveAnonymousId(): { id: string; created: boolean } {
    const pinned = process.env[ENV_ID]?.trim();
    if (pinned) return { id: pinned, created: false };

    const file = this.idFilePath();
    try {
      const existing = fs.readFileSync(file, 'utf8').trim();
      if (existing) return { id: existing, created: false };
    } catch {
      // not created yet
    }

    const id = randomUUID();
    try {
      fs.mkdirSync(this.telemetryDir(), { recursive: true });
      fs.writeFileSync(file, id, 'utf8');
    } catch {
      // Read-only FS: use the in-memory id this run (may churn; acceptable).
    }
    return { id, created: true };
  }

  // ─── payload pieces ────────────────────────────────────────────────────────────

  private version(): string {
    return process.env.npm_package_version?.trim() || '0.1.0';
  }

  private enabledPluginCount(): number {
    try {
      return pluginsConfig.plugins.filter((p) => p.enabled).length;
    } catch {
      return 0;
    }
  }

  private async readStoreConfig(): Promise<Heartbeat['store']> {
    try {
      const s = await this.prisma.storeSettings.findUnique({
        where: { id: 1 },
      });
      if (s) {
        return {
          currency: s.currency,
          country: s.country,
          region: s.region,
          locale: s.locale,
        };
      }
    } catch {
      // fall through to global defaults
    }
    return { currency: 'USD', country: 'US', region: 'us', locale: 'en-US' };
  }

  private async computeGmvBand(): Promise<GmvBand> {
    try {
      const since = new Date(
        Date.now() - GMV_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      );
      const agg = await this.prisma.order.aggregate({
        _sum: { total: true },
        where: { paymentStatus: PaymentStatus.PAID, createdAt: { gte: since } },
      });
      return gmvBandOf(agg._sum.total ?? 0);
    } catch {
      return 'unknown';
    }
  }

  // ─── transport ─────────────────────────────────────────────────────────────────

  private endpoint(): string {
    return process.env[ENV_ENDPOINT]?.trim() || DEFAULT_ENDPOINT;
  }

  private async post(body: Heartbeat): Promise<void> {
    if (typeof fetch !== 'function') return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    try {
      await fetch(this.endpoint(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      // Network/timeout/abort — swallow. Telemetry is best-effort.
    } finally {
      clearTimeout(timer);
    }
  }

  private logNotice(): void {
    this.logger.log(
      'Anonymous usage telemetry is ON (no personal data; see docs/TELEMETRY.md). ' +
        `Opt out any time with ${ENV_DISABLED}=1 or ${ENV_DO_NOT_TRACK}=1.`,
    );
  }
}
