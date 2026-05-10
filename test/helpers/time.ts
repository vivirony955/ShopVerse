/**
 * QA Phase-1 — time control for TTL / expiry / cron tests.
 *
 * Why not @sinonjs/fake-timers: our code calls `NOW()` in raw SQL, which
 * bypasses any JS-level fake clock. The portable approach is:
 *   1. For JS-level Date.now() mocking → `freezeDate` / `advanceDate`
 *   2. For DB-level "make this row appear expired" → `backdateReservationExpiry`
 *      which writes a past `expiresAt` directly, letting the unchanged cron
 *      pick it up on the next run.
 *
 * Tests should prefer (2) for reservation/cron scenarios because it tests
 * the real SQL path; use (1) only when JS time is the thing under test.
 */
import { prisma } from './db';

// ─── JS-level Date control ───────────────────────────────────────────────────

let originalDateNow: (() => number) | null = null;

/** Freeze `Date.now()` at a specific instant. Call `unfreezeDate()` to restore. */
export function freezeDate(at: Date | number): void {
  const ms = typeof at === 'number' ? at : at.getTime();
  if (originalDateNow === null) originalDateNow = Date.now.bind(Date);
  Date.now = () => ms;
}

/** Advance frozen time by N milliseconds. No-op if `freezeDate` wasn't called. */
export function advanceDate(ms: number): void {
  if (originalDateNow === null) return;
  const next = Date.now() + ms;
  Date.now = () => next;
}

/** Restore real `Date.now()`. Call in afterEach. */
export function unfreezeDate(): void {
  if (originalDateNow !== null) {
    Date.now = originalDateNow;
    originalDateNow = null;
  }
}

// ─── DB-level "age the row" helpers ──────────────────────────────────────────

/**
 * Mark a reservation as already expired at the DB level. Used to drive the
 * `expireOldReservations` cron without waiting 15 real minutes.
 *
 * NOTE: does not touch status — the row remains ACTIVE until the cron flips it.
 */
export async function backdateReservationExpiry(
  reservationId: number,
  minutesInPast = 1,
): Promise<void> {
  const past = new Date(Date.now() - minutesInPast * 60_000);
  await prisma.cartReservation.update({
    where: { id: reservationId },
    data: { expiresAt: past },
  });
}

/**
 * Mark a RefundRequest as stuck PROCESSING from N hours ago — drives the
 * refund retry cron (`RefundRetryService`) without real wall-clock waiting.
 */
export async function backdateRefundForRetry(
  refundId: number,
  hoursStuck = 2,
): Promise<void> {
  const past = new Date(Date.now() - hoursStuck * 3_600_000);
  await prisma.refundRequest.update({
    where: { id: refundId },
    data: { updatedAt: past },
  });
}
