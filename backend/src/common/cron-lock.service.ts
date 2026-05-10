// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hostname } from 'os';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Distributed cron lock (FINAL §9.4 M-005).
 *
 * Usage:
 *   await cronLock.runExclusive('daily-inventory-sync', 5 * 60_000, async () => {
 *     // ... job body; runs on at most one instance ...
 *   });
 *
 * Guarantees: at most one holder of `name` at any time across the fleet. Stale locks
 * (acquiredBy-instance crashed) expire after `ttlMs` and can be reclaimed.
 */
@Injectable()
export class CronLockService {
  private readonly logger = new Logger(CronLockService.name);
  private readonly holderId = `${hostname()}:${process.pid}`;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Attempt to acquire `name` for `ttlMs`. Returns true if acquired, false if another
   * instance already holds it. Expired locks are treated as free.
   */
  async acquire(name: string, ttlMs: number): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    // Fast path: try to INSERT. Unique violation → someone else has it (fresh or stale).
    try {
      await this.prisma.cronLock.create({
        data: { name, holder: this.holderId, acquiredAt: now, expiresAt },
      });
      return true;
    } catch (e) {
      if (
        !(e instanceof Prisma.PrismaClientKnownRequestError) ||
        e.code !== 'P2002'
      ) {
        throw e;
      }
    }

    // Slow path: lock exists. Steal it only if expired. Conditional update prevents
    // two racers from both stealing.
    const stolen = await this.prisma.cronLock.updateMany({
      where: { name, expiresAt: { lt: now } },
      data: { holder: this.holderId, acquiredAt: now, expiresAt },
    });
    return stolen.count === 1;
  }

  /** Release a lock we own. No-op if we no longer own it. */
  async release(name: string): Promise<void> {
    await this.prisma.cronLock.deleteMany({
      where: { name, holder: this.holderId },
    });
  }

  /** Run `fn` only if we acquire the lock. Returns fn's result, or undefined if skipped. */
  async runExclusive<T>(
    name: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    const got = await this.acquire(name, ttlMs);
    if (!got) {
      this.logger.debug(`cron '${name}' skipped — held by another instance`);
      return undefined;
    }
    try {
      return await fn();
    } finally {
      await this.release(name).catch((err: unknown) =>
        this.logger.warn(
          `failed to release cron lock '${name}': ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  }
}
