// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * HookRunner microbenchmark — plan §5 (perf rule: <100ns at 0 handlers).
 *
 * Not part of the Jest test suite. Run manually:
 *
 *   cd backend && npx ts-node src/common/hook-runner.bench.ts
 *
 * Output is captured in cross-cutting/PERF_BUDGET_TRACKER.md as the
 * baseline for the W1 completion gate.
 *
 * The benchmark warms up with 10k iterations, then measures 1M
 * iterations of runSync against an empty registry. Reports
 * nanoseconds per call.
 */

import { HookRunner } from './hook-runner.service';
import type { OrderPreValidateContext } from '@shopverse/sdk';

const CTX: OrderPreValidateContext = {
  userId: 1,
  cart: { id: 1, userId: 1, items: [], subtotal: 0 },
  address: {
    id: 1,
    fullName: 'Bench',
    line1: '1 St',
    line2: null,
    city: 'Mumbai',
    state: 'MH',
    pincode: '400001',
    country: 'IN',
  },
  warehouseContext: { primaryWarehouseId: 1, availableWarehouseIds: [1] },
  couponCode: null,
  walletAmountUsed: 0,
};

async function bench(label: string, iterations: number, fn: () => Promise<void>): Promise<number> {
  // Warm up
  for (let i = 0; i < 10_000; i++) await fn();

  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) await fn();
  const elapsed = Number(process.hrtime.bigint() - t0);
  const nsPerCall = elapsed / iterations;

  // eslint-disable-next-line no-console
  console.log(
    `${label.padEnd(40)} ${iterations.toLocaleString().padStart(12)} calls ` +
      `→ ${(elapsed / 1e6).toFixed(2)}ms total ` +
      `→ ${nsPerCall.toFixed(0)}ns/call`,
  );
  return nsPerCall;
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('\n  HookRunner Microbenchmark');
  // eslint-disable-next-line no-console
  console.log('  ' + '─'.repeat(70));

  const runner = new HookRunner();

  // ── 1. Empty registry (the load-bearing fast path) ──────────────────────
  const emptyNs = await bench(
    'empty registry (no-op fast path)',
    1_000_000,
    () => runner.runSync('order.preValidate', CTX).then(() => undefined),
  );

  // ── 2. Single handler that resolves immediately ─────────────────────────
  runner.register('order.preValidate', '@bench', async () => undefined);
  await bench(
    'single noop handler',
    100_000,
    () => runner.runSync('order.preValidate', CTX).then(() => undefined),
  );

  // ── Summary ──────────────────────────────────────────────────────────────
  // eslint-disable-next-line no-console
  console.log('  ' + '─'.repeat(70));
  // eslint-disable-next-line no-console
  console.log(
    `  Plan §5 target: empty registry < 100ns/call.\n  Result: ${emptyNs.toFixed(0)}ns/call ${emptyNs < 100 ? '✓ PASS' : '✗ FAIL'}\n`,
  );

  if (emptyNs >= 100) process.exit(1);
}

void main();
