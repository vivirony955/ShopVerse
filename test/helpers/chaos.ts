// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * QA Phase-1 — failure injection primitives.
 *
 * Scope: only the chaos tools that integrate cleanly with our in-process
 * test harness. Kernel-level chaos (toxiproxy, pg_terminate_backend) stays
 * in the Phase-7 load test scripts where it belongs.
 *
 * What's here:
 *   - Stripe mock switches (configurable per-test)
 *   - Redis flush helper (drives gate-drift scenarios without killing the server)
 *   - pg "slow query" helper via pg_sleep (simulates a stuck admin lock)
 */
import { prisma } from './db';

// ─── Stripe mock ─────────────────────────────────────────────────────────────

export type StripeMockMode =
  | 'success'          // normal happy path
  | 'fail-4xx'         // non-retryable (e.g., invalid card)
  | 'fail-5xx'         // retryable (gateway timeout / 502)
  | 'slow'             // delays response 5s
  | 'duplicate-webhook';  // returns same event id twice

interface StripeMockState {
  mode: StripeMockMode;
  intentCounter: number;
  capturedEvents: Array<{ id: string; type: string }>;
}

const stripeState: StripeMockState = {
  mode: 'success',
  intentCounter: 0,
  capturedEvents: [],
};

/**
 * Flip the mock Stripe behavior for the next calls. Tests should call this
 * in `beforeEach` and reset in `afterEach` via `resetStripeMock()`.
 *
 * NOTE: the actual PaymentsService still needs to be wired to consume this
 * state via a TestStripeService provider override. PHASE-4 will add that
 * wiring when the failure-injection specs land — for now, this helper
 * exists so tests that don't need real Stripe calls can stub the
 * PaymentsService directly and check `stripeState.mode`.
 */
export function setStripeMock(mode: StripeMockMode): void {
  stripeState.mode = mode;
}

export function resetStripeMock(): void {
  stripeState.mode = 'success';
  stripeState.intentCounter = 0;
  stripeState.capturedEvents = [];
}

export function getStripeMockState(): Readonly<StripeMockState> {
  return stripeState;
}

/**
 * Generate a deterministic Stripe event payload for webhook replay tests.
 * `nonce` controls whether duplicate-webhook mode returns the SAME id twice.
 */
export function fakeStripeEvent(
  type: 'payment_intent.succeeded' | 'payment_intent.payment_failed' | 'charge.refunded',
  orderId: number,
  amount: number,
  nonce = 0,
): { id: string; type: string; data: { object: Record<string, unknown> } } {
  const id = stripeState.mode === 'duplicate-webhook'
    ? `evt_fake_${orderId}`  // stable id → caller can replay
    : `evt_fake_${orderId}_${nonce}_${++stripeState.intentCounter}`;
  stripeState.capturedEvents.push({ id, type });
  return {
    id,
    type,
    data: {
      object: {
        id: `pi_fake_${orderId}`,
        amount: Math.round(amount * 100),
        metadata: { orderId: String(orderId) },
      },
    },
  };
}

// ─── Redis chaos ─────────────────────────────────────────────────────────────

/**
 * Flush all Redis keys. Use to force a "cold cache" situation where the
 * advisory reserve gate must lazy-init from Postgres — exercises the
 * branch in `cart-reservation.service::createReservation` that calls
 * `initReserveGate` after a null `tryReserveGate`.
 *
 * No-op when Redis is disabled (REDIS_URL unset). Tests that require
 * this helper MUST set `REDIS_URL` in env-setup or skip themselves.
 */
export async function flushRedis(): Promise<void> {
  if (!process.env.REDIS_URL) return;
  try {
    // Dynamic require avoids adding ioredis as a test devDependency — backend already ships it.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const IORedis = require('ioredis');
    const ctor = IORedis.default ?? IORedis;
    const client = new ctor(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    await client.connect();
    await client.flushdb();
    await client.quit();
  } catch {
    // Redis unreachable — tests that need it should have checked isRedisAvailable() first.
  }
}

export function isRedisAvailable(): boolean {
  return Boolean(process.env.REDIS_URL);
}

// ─── Postgres chaos ──────────────────────────────────────────────────────────

/**
 * Hold a row-level lock on a WarehouseInventory row for N seconds, then
 * release. Used to simulate a long-running admin query blocking the
 * reservation path (QA-C-11).
 *
 * Runs in a detached transaction that commits after `holdSeconds` — caller
 * should `await` the returned promise to ensure cleanup before the test
 * ends.
 */
export async function holdWarehouseInventoryLock(
  warehouseId: number,
  variantId: number,
  holdSeconds: number,
): Promise<void> {
  // pg_sleep inside a FOR UPDATE tx — blocks anyone else who wants the row.
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "stock" FROM "WarehouseInventory"
      WHERE "warehouseId" = ${warehouseId} AND "variantId" = ${variantId}
      FOR UPDATE
    `;
    await tx.$queryRaw`SELECT pg_sleep(${holdSeconds})`;
  }, { timeout: (holdSeconds + 5) * 1000 });
}

/**
 * Directly corrupt a variant's reservedStock cache to simulate an
 * upstream bug that bypassed syncVariantCache. Tests then verify the
 * invariant validator detects the drift and the runbook SQL recovers.
 */
export async function corruptReservedStockCache(
  variantId: number,
  fakeValue: number,
): Promise<void> {
  await prisma.variant.update({
    where: { id: variantId },
    data: { reservedStock: fakeValue },
  });
}
