// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';

/**
 * W4 PERF: singleton Redis client for read-through caches (PLP, PDP) and
 * ephemeral state (rate limit buckets, flash-sale counters).
 *
 * Behaviour:
 *  - If REDIS_URL is unset → service is DISABLED. get/set/del are no-ops,
 *    isEnabled() returns false. Callers must treat this as a cache miss and
 *    fall back to the DB path. This lets dev/test run without Redis.
 *  - If REDIS_URL is set but Redis is unreachable → logs once, treats every
 *    call as a miss. Does NOT throw — a cache outage must never 500 the API.
 *  - All methods swallow errors and log at warn level. The source of truth is
 *    always Postgres; Redis is strictly an accelerator.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private healthy = false;
  // P-16 PERF: in-process single-flight map. Coalesces concurrent misses for
  // the same cache key within one node instance — the first caller runs the
  // loader, all other callers await the same promise. Cross-instance
  // stampede still possible but scale of concern drops from O(users) to O(pods).
  private readonly inflight = new Map<string, Promise<unknown>>();

  async onModuleInit(): Promise<void> {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.warn(
        'REDIS_URL not set — RedisService running in no-op mode',
      );
      return;
    }
    try {
      this.client = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 2,
        enableOfflineQueue: false,
      });
      this.client.on('error', (err) => {
        if (this.healthy) {
          this.logger.warn(`Redis connection error: ${err.message}`);
        }
        this.healthy = false;
      });
      this.client.on('ready', () => {
        this.healthy = true;
        this.logger.log('Redis connected');
      });
      await this.client.connect();
      // health check
      await this.client.ping();
      this.healthy = true;
    } catch (e: unknown) {
      this.logger.warn(
        `Redis init failed, falling back to no-op: ${e instanceof Error ? e.message : String(e)}`,
      );
      this.healthy = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client?.quit();
    } catch {
      // ignore
    }
  }

  isEnabled(): boolean {
    return this.healthy && this.client !== null;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    if (!this.isEnabled()) return null;
    try {
      const raw = await this.client!.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (e: unknown) {
      this.logger.debug(
        `redis.get(${key}) failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  /**
   * P-16 PERF: single-flight read-through cache wrapper. Pattern:
   *   1. Try Redis GET — if hit, return immediately.
   *   2. Check in-process inflight map — if another request is already loading
   *      this key, await that promise (coalescing concurrent DB loads).
   *   3. Otherwise, execute the loader, SET the result, return.
   *
   * Protects against cache stampede: 1000 concurrent PDP requests on a freshly
   * expired key all serialize onto ONE loader call per pod instead of 1000
   * parallel DB hits. The loader's return value must be JSON-serializable.
   *
   * On Redis-disabled mode: behaves as passthrough (calls loader every time,
   * but still coalesces within-pod concurrent calls via the inflight map).
   */
  async getOrLoad<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    // 1. Cache hit path.
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    // 2. Inflight coalesce — another request is already loading this key.
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    // 3. Run loader exactly once, populate cache, resolve waiters.
    const promise = (async () => {
      try {
        const value = await loader();
        if (value !== undefined && value !== null) {
          await this.set(key, value, ttlSeconds);
        }
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, promise);
    return promise;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      await this.client!.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (e: unknown) {
      this.logger.debug(
        `redis.set(${key}) failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!this.isEnabled() || keys.length === 0) return;
    try {
      await this.client!.del(...keys);
    } catch (e: unknown) {
      this.logger.debug(
        `redis.del failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /**
   * W6 B-01: atomic "try-reserve N units" gate. Returns:
   *   - `true`  if the key existed and had ≥ qty, then decremented it
   *   - `false` if the key existed but had insufficient stock (gate rejects)
   *   - `null`  if the key didn't exist → caller must fall through to authoritative path
   *
   * Lua script is EVAL'd atomically so concurrent callers cannot race past the check.
   * The key is INTENTIONALLY absent on cold start — the caller populates it lazily
   * via `initReserveGate()` from the Postgres sellable count when it first observes
   * a cache miss (or a warmer does it on flash-sale start).
   */
  async tryReserveGate(key: string, qty: number): Promise<boolean | null> {
    if (!this.isEnabled()) return null;
    try {
      const script = `
        local v = redis.call('GET', KEYS[1])
        if not v then return -2 end
        local n = tonumber(v)
        local q = tonumber(ARGV[1])
        if n < q then return -1 end
        return redis.call('DECRBY', KEYS[1], q)
      `;
      const result = (await this.client!.eval(
        script,
        1,
        key,
        String(qty),
      )) as number;
      if (result === -2) return null; // key missing → caller handles
      if (result === -1) return false; // insufficient — gate rejects
      return true;
    } catch (e: unknown) {
      this.logger.debug(
        `tryReserveGate(${key}) failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null; // on error, fall through — Redis is advisory, not authoritative
    }
  }

  /**
   * W6 B-01: release N units back to the gate (on reservation release/expiry).
   * Best-effort: a missing key is fine, a capped increment is fine.
   */
  async releaseReserveGate(key: string, qty: number): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      // Only INCR if key exists — avoid creating phantom gates on release-after-expire.
      const script = `
        if redis.call('EXISTS', KEYS[1]) == 1 then
          return redis.call('INCRBY', KEYS[1], ARGV[1])
        end
        return 0
      `;
      await this.client!.eval(script, 1, key, String(qty));
    } catch (e: unknown) {
      this.logger.debug(
        `releaseReserveGate(${key}) failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** Populate a reserve gate if absent. Uses SET NX so concurrent initers don't clobber. */
  async initReserveGate(
    key: string,
    initialValue: number,
    ttlSeconds: number,
  ): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      await this.client!.set(key, String(initialValue), 'EX', ttlSeconds, 'NX');
    } catch (e: unknown) {
      this.logger.debug(
        `initReserveGate(${key}) failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** Delete all keys matching a pattern. Uses SCAN to avoid blocking Redis. */
  async delByPattern(pattern: string): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      const stream = this.client!.scanStream({ match: pattern, count: 100 });
      const pipeline = this.client!.pipeline();
      let pending = 0;
      for await (const keys of stream as AsyncIterable<string[]>) {
        for (const k of keys) {
          pipeline.del(k);
          pending++;
        }
      }
      if (pending > 0) await pipeline.exec();
    } catch (e: unknown) {
      this.logger.debug(
        `redis.delByPattern(${pattern}) failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
