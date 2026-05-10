// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * QA Phase-1 — concurrency primitives for race-condition tests.
 *
 * All helpers assume Jest `--runInBand` mode (our default) so they only
 * parallelize WITHIN a single test, not across files. The DB connection
 * pool is shared, which is realistic — flash-sale races must fight over
 * the same pool as production.
 */

export interface ParallelResult<T> {
  fulfilled: T[];
  rejected: Error[];
  counts: { fulfilled: number; rejected: number; total: number };
}

/**
 * Run `fn(i)` N times concurrently via Promise.allSettled. Returns
 * categorized results so tests can assert exact counts without try/catch
 * acrobatics.
 *
 *   const r = await parallel(10, () => createReservation(userId));
 *   expect(r.counts.fulfilled).toBe(5);
 *   expect(r.counts.rejected).toBe(5);
 */
export async function parallel<T>(
  n: number,
  fn: (i: number) => Promise<T>,
): Promise<ParallelResult<T>> {
  const settled = await Promise.allSettled(
    Array.from({ length: n }, (_, i) => fn(i)),
  );
  const fulfilled: T[] = [];
  const rejected: Error[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') fulfilled.push(r.value);
    else rejected.push(r.reason instanceof Error ? r.reason : new Error(String(r.reason)));
  }
  return {
    fulfilled,
    rejected,
    counts: { fulfilled: fulfilled.length, rejected: rejected.length, total: n },
  };
}

/**
 * Synchronization barrier — blocks N callers until all N have arrived,
 * then releases them simultaneously. Use when you need the race window
 * to actually be contended: without a barrier, `Promise.all` launches
 * tasks in order and the first one often wins the DB lock before the
 * last one has even started.
 *
 *   const b = barrier(50);
 *   const r = await parallel(50, async (i) => {
 *     await b.wait();
 *     return createReservation(users[i].id);
 *   });
 */
export function barrier(n: number): { wait: () => Promise<void> } {
  let arrived = 0;
  let release!: () => void;
  const gate = new Promise<void>((res) => { release = res; });
  return {
    wait: async () => {
      arrived++;
      if (arrived >= n) release();
      await gate;
    },
  };
}

/**
 * Rejection predicate: "did at least K failures contain substring S?"
 * Avoids having to loop+filter in every test.
 */
export function countRejectionsMatching(
  result: ParallelResult<unknown>,
  substring: string,
): number {
  return result.rejected.filter((e) => e.message.includes(substring)).length;
}

/**
 * Helper for exact-count assertions: "exactly K succeeded, N-K rejected
 * with reason R". Returns a boolean so tests can wrap it in expect(...).
 */
export function isRaceResult(
  result: ParallelResult<unknown>,
  expected: { fulfilled: number; rejectionSubstring?: string },
): boolean {
  if (result.counts.fulfilled !== expected.fulfilled) return false;
  if (expected.rejectionSubstring) {
    const matching = countRejectionsMatching(result, expected.rejectionSubstring);
    if (matching !== result.counts.rejected) return false;
  }
  return true;
}
