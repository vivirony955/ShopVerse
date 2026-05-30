// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * QA Phase-3 — D-series concurrency tests.
 *
 * Focus: regression guards for the Wave 6/7 audit fixes.
 *
 *   QA-D-01 — N users on K stock via createReservation: exactly K fulfilled,
 *             no oversell, I-1 + I-2 intact.  (exercises the conditional
 *             WHERE-guard `UPDATE ... WHERE (stock-reserved) >= qty`)
 *
 *   QA-D-04 — releaseById races expireOldReservations on the same row.
 *             This is the A-1 regression guard — before the fix, both the
 *             releaseById path and the CTE cron decremented WI.reserved
 *             for the same reservation, driving Variant.reservedStock below
 *             the true active-order tally. The fix is the conditional
 *             `updateMany(where: { id, status: 'ACTIVE' })` at the top of
 *             the release tx: whoever flips the status wins, the other
 *             skips the decrement. Test: start 1 reservation, backdate
 *             expiresAt, fire releaseById + expireOldReservations in
 *             parallel, assert WI.reserved decrements exactly once.
 *
 *   QA-D-05 — Two concurrent expireOldReservations calls (simulating two
 *             pods). With cron-lock + FOR UPDATE SKIP LOCKED, one wins,
 *             the other no-ops. Test: seed 3 expired reservations, call
 *             expireOldReservations twice in parallel, assert total
 *             WI.reserved delta == sum of reserved quantities (not 2x).
 *
 * Expansion — D-02/06/09/14/15/16 (D-07/08/10/11/12/13 deferred — they
 * need Coupons/Wallet/Orders/Stripe services that share the same test
 * harness ScheduleModule DI issue as getTestApp()):
 *
 *   QA-D-02 — Scaled oversell: 100 parallel createReservation on stock=20
 *             (non-flash, Postgres-only path). Exactly 20 fulfilled.
 *   QA-D-06 — Admin stock adjust races createReservation. The conditional
 *             UPDATE + write-through cache keep I-1 intact regardless of
 *             interleaving.
 *   QA-D-09 — Same user, 2 tabs, 2 concurrent createReservation calls.
 *             enforceConcurrentCap must not double-count reservations at
 *             the per-user cap; WI.reserved must match only the surviving
 *             ACTIVE reservations.
 *   QA-D-14 — Cart mutated mid-createReservation. The snapshot captured
 *             at the top of the tx is what gets reserved — later cart
 *             writes don't leak into the reservation.
 *   QA-D-15 — Consume races expiry: a reservation flipped ACTIVE→CONSUMED
 *             (order placement) must NOT have its WI.reserved released by
 *             the expiry CTE. Validates the inner `status='ACTIVE'`
 *             re-check inside the CTE (B-12 safety).
 *   QA-D-16 — Cap enforce releases oldest on 4th creation: user at the
 *             3-concurrent cap creating a 4th reservation has the oldest
 *             ACTIVE row expired in-place; WI.reserved reflects only
 *             the surviving set.
 */
import { cleanDatabase, prisma } from './helpers/db';
import { cleanQATables, makeShopper, makeShoppersOnSameSKU } from './helpers/factories';
import { parallel, barrier } from './helpers/concurrency';
import { assertAllInvariants } from './helpers/invariants';
import { CartReservationService } from '../backend/src/cart/cart-reservation.service';

// Pre-existing getTestApp() bootstrap path fails on ScheduleModule DI in test/.
// That's a test-harness issue, not a product issue — we avoid it here by
// instantiating CartReservationService directly with the real PrismaClient
// and no-op stubs for CronLock + Redis. The D-series tests only care about
// DB-level races (I-1/I-2), so the Redis gate path (isFlash=true only) is
// intentionally out of scope — all tests here use non-flash products, which
// never invoke Redis.
describe('QA Phase-3: D-series concurrency', () => {
  let reservations: CartReservationService;

  beforeAll(async () => {
    // CronLockService stub: no-op wrapper — just runs the body. Real cron-lock
    // uses pg_try_advisory_lock; here QA-D-05 validates that two concurrent
    // bodies STILL produce correct state even without the lock (i.e. the CTE
    // + SKIP LOCKED + status='ACTIVE' re-check is itself load-bearing).
    const cronLockStub = {
      async runExclusive<T>(_n: string, _t: number, fn: () => Promise<T>): Promise<T | undefined> {
        return fn();
      },
    } as any;
    // RedisService stub: non-flash path never touches it. If it ever does,
    // return shapes that route through the Postgres fallback branch.
    const redisStub = {
      async tryReserveGate() { return null; },
      async initReserveGate() { /* no-op */ },
      async releaseReserveGate() { /* no-op */ },
    } as any;
    // W3.T7: HookRunner is on the DI graph but tests bypass it (no plugins
    // registered), so a no-handler stub matches the production fast-path.
    const hookRunnerStub = {
      handlerCount: () => 0,
      runSync: async () => ({ rejected: false, rejectReason: null, outcomes: [] }),
    } as any;
    reservations = new CartReservationService(prisma as any, cronLockStub, redisStub, hookRunnerStub);
  });

  beforeEach(async () => {
    await cleanQATables();
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanQATables();
    await cleanDatabase();
  });

  // ─── QA-D-01: oversell guard ──────────────────────────────────────────────

  it('QA-D-01: 10 parallel createReservation on stock=5 → exactly 5 succeed', async () => {
    const fx = await makeShoppersOnSameSKU(10, { stock: 5, cartQty: 1 });
    const gate = barrier(10);
    const r = await parallel(10, async (i) => {
      await gate.wait();
      return reservations.createReservation(fx.shoppers[i].userId);
    });

    expect(r.counts.fulfilled).toBe(5);
    expect(r.counts.rejected).toBe(5);
    // Every rejection must cite insufficient stock — not some other noise
    expect(
      r.rejected.every((e) => /Insufficient stock/i.test(e.message)),
    ).toBe(true);

    // I-1/I-2 hold: WI.reserved == 5, Variant.reservedStock == 5
    const v = await prisma.variant.findUnique({ where: { id: fx.variantId } });
    expect(v?.reservedStock).toBe(5);
    const wi = await prisma.warehouseInventory.findUnique({
      where: { warehouseId_variantId: { warehouseId: fx.warehouseId, variantId: fx.variantId } },
    });
    expect(wi?.reserved).toBe(5);
    expect(wi?.stock).toBe(5);
    await assertAllInvariants();
  });

  // ─── QA-D-04: releaseById vs expiry cron (A-1 regression guard) ──────────

  it('QA-D-04: releaseById races expireOldReservations — WI.reserved decrements exactly once', async () => {
    const s = await makeShopper({ stock: 10, cartQty: 3 });
    const res = await reservations.createReservation(s.user.id);

    // Sanity: WI.reserved should now be 3
    const beforeWi = await prisma.warehouseInventory.findUnique({
      where: { warehouseId_variantId: { warehouseId: s.warehouseId, variantId: s.variant.id } },
    });
    expect(beforeWi?.reserved).toBe(3);

    // Backdate expiresAt so the cron considers it eligible.
    await prisma.cartReservation.update({
      where: { id: res.reservationId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    // Fire both release paths in parallel. With the A-1 fix, exactly one
    // wins the ACTIVE→EXPIRED transition and performs the WI decrement.
    const gate = barrier(2);
    await Promise.allSettled([
      (async () => { await gate.wait(); await reservations.releaseById(res.reservationId, s.user.id); })(),
      (async () => { await gate.wait(); await reservations.expireOldReservations(); })(),
    ]);

    // Reservation ends EXPIRED (either path flips it).
    const after = await prisma.cartReservation.findUnique({
      where: { id: res.reservationId },
    });
    expect(after?.status).toBe('EXPIRED');

    // The regression guard: WI.reserved back to 0 — NOT -3 (clamped) or +3 (missed).
    const afterWi = await prisma.warehouseInventory.findUnique({
      where: { warehouseId_variantId: { warehouseId: s.warehouseId, variantId: s.variant.id } },
    });
    expect(afterWi?.reserved).toBe(0);
    expect(afterWi?.stock).toBe(10);

    // I-1/I-2 hold — no drift introduced by the race.
    const v = await prisma.variant.findUnique({ where: { id: s.variant.id } });
    expect(v?.reservedStock).toBe(0);
    expect(v?.stock).toBe(10);
    await assertAllInvariants();
  });

  // ─── QA-D-05: two-pod expiry cron (A-3 regression guard) ────────────────

  it('QA-D-05: two parallel expireOldReservations calls — cron-lock serializes, no double-decrement', async () => {
    // Seed 3 shoppers with ACTIVE reservations, each reserving 2 units.
    const fx = await makeShoppersOnSameSKU(3, { stock: 30, cartQty: 2 });
    for (const shopper of fx.shoppers) {
      await reservations.createReservation(shopper.userId);
    }

    // Sanity: WI.reserved should be 6 (3 * 2)
    const beforeWi = await prisma.warehouseInventory.findUnique({
      where: { warehouseId_variantId: { warehouseId: fx.warehouseId, variantId: fx.variantId } },
    });
    expect(beforeWi?.reserved).toBe(6);

    // Backdate every reservation so the cron picks them up.
    await prisma.cartReservation.updateMany({
      where: { status: 'ACTIVE' },
      data: { expiresAt: new Date(Date.now() - 5 * 60_000) },
    });

    // Two pods hit the cron simultaneously.
    const gate = barrier(2);
    await Promise.all([
      (async () => { await gate.wait(); await reservations.expireOldReservations(); })(),
      (async () => { await gate.wait(); await reservations.expireOldReservations(); })(),
    ]);

    // All 3 reservations ended EXPIRED; WI.reserved back to 0 (not -6, not 6).
    const expired = await prisma.cartReservation.count({ where: { status: 'EXPIRED' } });
    expect(expired).toBe(3);

    const afterWi = await prisma.warehouseInventory.findUnique({
      where: { warehouseId_variantId: { warehouseId: fx.warehouseId, variantId: fx.variantId } },
    });
    expect(afterWi?.reserved).toBe(0);
    expect(afterWi?.stock).toBe(30);

    const v = await prisma.variant.findUnique({ where: { id: fx.variantId } });
    expect(v?.reservedStock).toBe(0);
    expect(v?.stock).toBe(30);
    await assertAllInvariants();
  });

  // ─── QA-D-02: scaled oversell ─────────────────────────────────────────────

  it('QA-D-02: 100 parallel createReservation on stock=20 → exactly 20 succeed', async () => {
    const fx = await makeShoppersOnSameSKU(100, { stock: 20, cartQty: 1 });
    const gate = barrier(100);
    const r = await parallel(100, async (i) => {
      await gate.wait();
      return reservations.createReservation(fx.shoppers[i].userId);
    });

    expect(r.counts.fulfilled).toBe(20);
    expect(r.counts.rejected).toBe(80);
    expect(
      r.rejected.every((e) => /Insufficient stock/i.test(e.message)),
    ).toBe(true);

    const wi = await prisma.warehouseInventory.findUnique({
      where: { warehouseId_variantId: { warehouseId: fx.warehouseId, variantId: fx.variantId } },
    });
    expect(wi?.stock).toBe(20);
    expect(wi?.reserved).toBe(20);
    const v = await prisma.variant.findUnique({ where: { id: fx.variantId } });
    expect(v?.stock).toBe(20);
    expect(v?.reservedStock).toBe(20);
    await assertAllInvariants();
  }, 30_000);

  // ─── QA-D-06: admin stock adjust races createReservation ────────────────

  it('QA-D-06: admin stock bump races reservation — I-1 holds', async () => {
    const fx = await makeShoppersOnSameSKU(5, { stock: 10, cartQty: 2 });

    // Fire 5 reservations AND an admin stock adjust in parallel. The
    // adjust path mirrors what warehouse.service.ts does: write-through
    // both WI.stock and Variant.stock inside a transaction.
    const gate = barrier(6);
    await Promise.allSettled([
      ...fx.shoppers.map((s) => async () => {
        await gate.wait();
        return reservations.createReservation(s.userId);
      }).map((f) => f()),
      (async () => {
        await gate.wait();
        // Admin bumps stock +20 via the same write-through pattern the
        // real warehouse service uses (§7.1): update WI first, then sync Variant.
        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`
            UPDATE "WarehouseInventory" SET "stock" = "stock" + 20
            WHERE "warehouseId" = ${fx.warehouseId} AND "variantId" = ${fx.variantId}
          `;
          await tx.$executeRaw`
            UPDATE "Variant" SET "stock" = "stock" + 20 WHERE id = ${fx.variantId}
          `;
        });
      })(),
    ]);

    // 5 reservations × 2 units = 10 reserved, and stock is now 30.
    // Some reservations may have succeeded before the bump (5 on stock=10
    // means only 5 sellable units at best), some after. Either way:
    //   - WI.stock == 30 (authoritative)
    //   - WI.reserved == sum of successful reservation quantities
    //   - Variant cache matches WI on both fields (I-1)
    const wi = await prisma.warehouseInventory.findUnique({
      where: { warehouseId_variantId: { warehouseId: fx.warehouseId, variantId: fx.variantId } },
    });
    const v = await prisma.variant.findUnique({ where: { id: fx.variantId } });
    expect(wi?.stock).toBe(30);
    expect(v?.stock).toBe(30);
    // Cache must mirror WI on reserved too
    expect(v?.reservedStock).toBe(wi?.reserved);
    // And active reservations * 2 == WI.reserved
    const activeReservedTotal = await prisma.cartReservationItem.aggregate({
      _sum: { quantity: true },
      where: { reservation: { status: 'ACTIVE' } },
    });
    expect(wi?.reserved).toBe(activeReservedTotal._sum.quantity ?? 0);
    await assertAllInvariants();
  });

  // ─── QA-D-09: same user, 2 tabs, 2 concurrent createReservation ────────

  it('QA-D-09: same user 2 tabs — cap enforces, WI.reserved matches survivors', async () => {
    const s = await makeShopper({ stock: 20, cartQty: 3 });

    // Two simultaneous calls from the same user — simulates 2 browser tabs
    // hitting "start checkout" at once. Both should succeed (cap is 3),
    // producing 2 ACTIVE reservations with 6 units reserved total.
    const gate = barrier(2);
    const r = await parallel(2, async () => {
      await gate.wait();
      return reservations.createReservation(s.user.id);
    });

    // Both paths MAY succeed (cap=3) — what matters is WI.reserved matches
    // whatever survived, and no double-counting.
    const active = await prisma.cartReservation.findMany({
      where: { userId: s.user.id, status: 'ACTIVE' },
      include: { items: true },
    });
    const expectedReserved = active.reduce(
      (acc, res) => acc + res.items.reduce((a, i) => a + i.quantity, 0),
      0,
    );
    const wi = await prisma.warehouseInventory.findUnique({
      where: { warehouseId_variantId: { warehouseId: s.warehouseId, variantId: s.variant.id } },
    });
    expect(wi?.reserved).toBe(expectedReserved);
    const v = await prisma.variant.findUnique({ where: { id: s.variant.id } });
    expect(v?.reservedStock).toBe(expectedReserved);
    expect(r.counts.total).toBe(2);
    await assertAllInvariants();
  });

  // ─── QA-D-14: cart mutated mid-createReservation ────────────────────────

  it('QA-D-14: cart mutated during reservation — internal consistency holds regardless of race order', async () => {
    // Whichever path wins (cart-read-then-mutate or mutate-then-cart-read),
    // the invariant to preserve is: reservation items + WI.reserved + Variant
    // cache are all pairwise consistent. The service is allowed to capture
    // either snapshot — what it cannot do is reserve qty A and mark qty B
    // on the reservation row, or leak the mutation halfway.
    const s = await makeShopper({ stock: 100, cartQty: 2 });

    const reservationP = reservations.createReservation(s.user.id);
    const mutationP = (async () => {
      await prisma.cartItem.updateMany({
        where: { cartId: s.cartId, variantId: s.variant.id },
        data: { quantity: 50 },
      });
    })();

    const [res] = await Promise.all([reservationP, mutationP]);

    // Reservation captured SOME quantity — either 2 (pre-mutation) or 50
    // (post-mutation). Both are valid; what matters is that this qty is
    // consistent across reservation item, WI.reserved, and Variant cache.
    const items = await prisma.cartReservationItem.findMany({
      where: { reservationId: res.reservationId },
    });
    expect(items).toHaveLength(1);
    const reservedQty = items[0].quantity;
    expect([2, 50]).toContain(reservedQty);

    const wi = await prisma.warehouseInventory.findUnique({
      where: { warehouseId_variantId: { warehouseId: s.warehouseId, variantId: s.variant.id } },
    });
    expect(wi?.reserved).toBe(reservedQty);
    const v = await prisma.variant.findUnique({ where: { id: s.variant.id } });
    expect(v?.reservedStock).toBe(reservedQty);
    expect(v?.stock).toBe(100);
    await assertAllInvariants();
  });

  // ─── QA-D-15: consume races expiry (CTE status re-check) ────────────────

  it('QA-D-15: CONSUMED reservation racing expiry — cron must NOT touch WI.reserved', async () => {
    const s = await makeShopper({ stock: 10, cartQty: 3 });
    const res = await reservations.createReservation(s.user.id);

    // Sanity: WI.reserved = 3
    const beforeWi = await prisma.warehouseInventory.findUnique({
      where: { warehouseId_variantId: { warehouseId: s.warehouseId, variantId: s.variant.id } },
    });
    expect(beforeWi?.reserved).toBe(3);

    // Simulate the orders path: flip ACTIVE→CONSUMED. In production this
    // happens inside placeOrder; the reservation row transitions away from
    // the cron's attention, and WI.reserved stays — the order now "owns"
    // the reservation through the active OrderItem.qty invariant (I-2).
    // Also backdate expiresAt to bait the cron into considering it.
    await prisma.cartReservation.update({
      where: { id: res.reservationId },
      data: { status: 'CONSUMED', expiresAt: new Date(Date.now() - 10 * 60_000) },
    });

    // Run the expiry cron — it should SKIP the CONSUMED row via the
    // `status = 'ACTIVE'` re-check inside the CTE (B-12 safety).
    await reservations.expireOldReservations();

    // Reservation remains CONSUMED (not flipped to EXPIRED).
    const after = await prisma.cartReservation.findUnique({ where: { id: res.reservationId } });
    expect(after?.status).toBe('CONSUMED');

    // CRITICAL: WI.reserved must remain 3 — the CTE must not release
    // reserved stock for a row the order path already committed to.
    const afterWi = await prisma.warehouseInventory.findUnique({
      where: { warehouseId_variantId: { warehouseId: s.warehouseId, variantId: s.variant.id } },
    });
    expect(afterWi?.reserved).toBe(3);
    expect(afterWi?.stock).toBe(10);

    const v = await prisma.variant.findUnique({ where: { id: s.variant.id } });
    expect(v?.reservedStock).toBe(3);
    expect(v?.stock).toBe(10);
    // Note: assertAllInvariants() would flag I-2 (orders-vs-cache) because
    // we short-circuited the order path — there's no Order row matching
    // the CONSUMED reservation. That's an artifact of the simulation, not
    // a real violation. Skip the omnibus assertion here and verify I-1 /
    // WI consistency manually above.
  });

  // ─── QA-D-16: cap enforce releases oldest ACTIVE on 4th creation ───────

  it('QA-D-16: 4th reservation by same user expires oldest — WI.reserved stays correct', async () => {
    // Three different variants so the cap is hit by distinct reservations.
    const s1 = await makeShopper({ stock: 20, cartQty: 1 });
    // Additional variants under the same user: reuse s1.user, create new
    // products + carts to bypass the "one cart per user" unique constraint.
    // Simpler: just create 3 cart items across one cart, then release and
    // recreate — not quite the same scenario. Instead, create 3 carts for
    // 3 users sharing one variant to validate the cap on the same user.
    //
    // The cleanest path with our factories is: one user, ONE cart with
    // ONE item; place 3 reservations by manually flipping prior ones back
    // to ACTIVE between calls. That doesn't exercise enforceConcurrentCap.
    //
    // Alternative: seed 3 extra ACTIVE reservations directly in the DB
    // against the same user + cart, then call createReservation a 4th
    // time. The service will see 3 ACTIVE on enforceConcurrentCap entry
    // and expire the oldest. Verify WI.reserved is consistent with the
    // surviving 3 reservations after.
    const extraRes: number[] = [];
    for (let i = 0; i < 3; i++) {
      const row = await prisma.cartReservation.create({
        data: {
          cartId: s1.cartId,
          userId: s1.user.id,
          status: 'ACTIVE',
          isFlash: false,
          expiresAt: new Date(Date.now() + 10 * 60_000),
          // Stagger createdAt so "oldest" is deterministic
          createdAt: new Date(Date.now() - (10 - i) * 1000),
          items: {
            create: [{
              variantId: s1.variant.id,
              warehouseId: s1.warehouseId,
              quantity: 1,
              lockedPrice: 100,
              lockedMrp: 100,
            }],
          },
        },
      });
      extraRes.push(row.id);
      // Bump WI.reserved manually so the baseline state is consistent.
      await prisma.$executeRaw`
        UPDATE "WarehouseInventory" SET "reserved" = "reserved" + 1
        WHERE "warehouseId" = ${s1.warehouseId} AND "variantId" = ${s1.variant.id}
      `;
      await prisma.$executeRaw`
        UPDATE "Variant" SET "reservedStock" = "reservedStock" + 1 WHERE id = ${s1.variant.id}
      `;
    }
    // Sanity: 3 reserved, at cap.
    const preWi = await prisma.warehouseInventory.findUnique({
      where: { warehouseId_variantId: { warehouseId: s1.warehouseId, variantId: s1.variant.id } },
    });
    expect(preWi?.reserved).toBe(3);

    // 4th call triggers enforceConcurrentCap → expires the oldest (extraRes[0]).
    const res = await reservations.createReservation(s1.user.id);

    // After:
    //   - extraRes[0] → EXPIRED (oldest killed by cap)
    //   - extraRes[1..2] + new res → 3 ACTIVE
    //   - WI.reserved: 3 (was 3, -1 oldest, +1 new)
    const oldest = await prisma.cartReservation.findUnique({ where: { id: extraRes[0] } });
    expect(oldest?.status).toBe('EXPIRED');
    const newRes = await prisma.cartReservation.findUnique({ where: { id: res.reservationId } });
    expect(newRes?.status).toBe('ACTIVE');
    const activeCount = await prisma.cartReservation.count({
      where: { userId: s1.user.id, status: 'ACTIVE' },
    });
    expect(activeCount).toBe(3);

    const postWi = await prisma.warehouseInventory.findUnique({
      where: { warehouseId_variantId: { warehouseId: s1.warehouseId, variantId: s1.variant.id } },
    });
    expect(postWi?.reserved).toBe(3);
    const v = await prisma.variant.findUnique({ where: { id: s1.variant.id } });
    expect(v?.reservedStock).toBe(3);
    await assertAllInvariants();
  });
});
