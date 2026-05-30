// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CronLockService } from '../common/cron-lock.service';
import { RedisService } from '../common/redis.service';
import { withCronMetric } from '../observability/cron-trace';
import { HookRunner } from '../common/hook-runner.service';
import type { ReadOnlyCart, WarehouseContext } from '@shopverse/sdk';

const RESERVATION_TTL_MS = 15 * 60 * 1000; // 15 minutes — FINAL §4.2
const FLASH_RESERVATION_TTL_MS = 5 * 60 * 1000; // 5 minutes for flash-sale items
const MAX_CONCURRENT_RESERVATIONS_PER_USER = 3; // §4.2 security
const PRICE_DRIFT_TOLERANCE = 0.005; // 0.5%
// B-01 PERF: Redis gate key template + TTL (matches flash reservation TTL + grace).
const reserveGateKey = (whId: number, variantId: number) =>
  `reserve:gate:wh:${whId}:var:${variantId}`;
const RESERVE_GATE_TTL_SECONDS = 60 * 60; // 1 hour — long enough to span a flash sale

export interface CreatedReservation {
  reservationId: number;
  expiresAt: Date;
  items: {
    variantId: number;
    quantity: number;
    lockedPrice: number;
    lockedMrp: number;
  }[];
  subtotal: number;
}

/**
 * Cart reservation service — FINAL §4.2.
 *
 * Parent/child model: one CartReservation row per checkout attempt,
 * N CartReservationItem children. Reserves WarehouseInventory.reserved
 * inside a single $transaction. placeOrder() requires a valid reservationId.
 */
@Injectable()
export class CartReservationService {
  private readonly logger = new Logger(CartReservationService.name);
  private defaultWarehouseId: number | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cronLock: CronLockService,
    private readonly redis: RedisService,
    private readonly hookRunner: HookRunner,
  ) {}

  private async getDefaultWarehouseId(
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    if (this.defaultWarehouseId !== null) return this.defaultWarehouseId;
    const wh = await tx.warehouse.findUnique({ where: { code: 'DEFAULT' } });
    if (!wh) throw new Error('DEFAULT warehouse not seeded');
    this.defaultWarehouseId = wh.id;
    return wh.id;
  }

  /**
   * Non-tx warehouse-context loader for the `cart.beforeReserve` hook
   * site. Reuses the same `defaultWarehouseId` cache as the tx-bound
   * `getDefaultWarehouseId` — first call from either path warms it.
   * Single-WH today; `availableWarehouseIds[]` stays empty per SDK
   * contract.
   */
  private async loadDefaultWarehouseContext(): Promise<WarehouseContext> {
    if (this.defaultWarehouseId === null) {
      const wh = await this.prisma.warehouse.findUnique({
        where: { code: 'DEFAULT' },
        select: { id: true },
      });
      if (!wh) throw new Error('DEFAULT warehouse not seeded');
      this.defaultWarehouseId = wh.id;
    }
    return {
      primaryWarehouseId: this.defaultWarehouseId,
      availableWarehouseIds: [],
    };
  }

  /**
   * Create a reservation for a user's cart. Returns a reservationId that
   * must be supplied to placeOrder. Phase 1: single DEFAULT warehouse.
   */
  async createReservation(userId: number): Promise<CreatedReservation> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: {
                  include: { flashSaleItems: { include: { flashSale: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!cart || cart.items.length === 0)
      throw new BadRequestException('Cart is empty');

    // W3.T7 — `cart.beforeReserve` hook site (plan §4 Type 1).
    // Runs AFTER cart load + empty check, BEFORE the reservation
    // transaction. Plugins can early-reject for geographic restrictions,
    // sold-out signals, etc. handlerCount check preserves the no-op
    // fast path. Budget: 100ms, per-plugin CircuitBreaker.
    if (this.hookRunner.handlerCount('cart.beforeReserve') > 0) {
      // Effective sticker price (base × (1 − discount%)). Flash-sale
      // discounts are NOT folded in here — that's still being negotiated
      // inside the reservation logic below, and the hook only needs a
      // useful approximation for plugin decisions (e.g. "reject if cart
      // total < ₹X").
      const computePrice = (basePrice: number, discountPct: number) =>
        basePrice * (1 - discountPct / 100);
      const cartCtx: ReadOnlyCart = {
        id: cart.id,
        userId,
        items: cart.items.map((it) => ({
          variantId: it.variantId,
          quantity: it.quantity,
          unitPrice: computePrice(
            it.variant.product.basePrice,
            it.variant.product.discountPct,
          ),
        })),
        subtotal: cart.items.reduce(
          (s, it) =>
            s +
            computePrice(
              it.variant.product.basePrice,
              it.variant.product.discountPct,
            ) *
              it.quantity,
          0,
        ),
      };
      const warehouseContext = await this.loadDefaultWarehouseContext();
      const result = await this.hookRunner.runSync('cart.beforeReserve', {
        userId,
        cart: cartCtx,
        warehouseContext,
      });
      if (result.rejected) {
        throw new BadRequestException(
          result.rejectReason?.message ?? 'Reservation rejected by plugin',
        );
      }
    }

    // Per-user cap: expire oldest ACTIVE if at limit.
    await this.enforceConcurrentCap(userId);

    // FLASH-CAP: enforce perUserMaxQty per flash sale product.
    const now2 = new Date();
    for (const item of cart.items) {
      const activeFlashSaleItem = (
        item.variant.product.flashSaleItems ?? []
      ).find(
        (fsi) => fsi.flashSale.startsAt <= now2 && fsi.flashSale.endsAt >= now2,
      );
      const fsiWithCap = activeFlashSaleItem as
        | (typeof activeFlashSaleItem & { perUserMaxQty?: number })
        | null
        | undefined;
      if (fsiWithCap && (fsiWithCap.perUserMaxQty ?? 0) > 0) {
        const cap = fsiWithCap.perUserMaxQty ?? 0;
        // Count qty already reserved/consumed by this user in this flash sale
        const existing = await this.prisma.cartReservationItem.aggregate({
          _sum: { quantity: true },
          where: {
            variantId: item.variantId,
            reservation: {
              userId,
              status: { in: ['ACTIVE', 'CONSUMED'] },
              cartId: { not: undefined },
            },
          },
        });
        const usedQty = existing._sum.quantity ?? 0;
        if (usedQty + item.quantity > cap) {
          throw new BadRequestException(
            `Flash sale limit: you can only purchase ${cap} unit(s) of "${item.variant.product.name}" per sale`,
          );
        }
      }
    }

    // Flash-sale items trigger 5-min TTL on the whole reservation (§4.2 edge case).
    const now = new Date();
    const isFlash = cart.items.some((item) =>
      (item.variant.product.flashSaleItems ?? []).some(
        (fsi) => fsi.flashSale.startsAt <= now && fsi.flashSale.endsAt >= now,
      ),
    );
    const ttl = isFlash ? FLASH_RESERVATION_TTL_MS : RESERVATION_TTL_MS;
    const expiresAt = new Date(Date.now() + ttl);

    return this.prisma.$transaction(async (tx) => {
      const whId = await this.getDefaultWarehouseId(tx);

      const parent = await tx.cartReservation.create({
        data: { cartId: cart.id, userId, expiresAt, isFlash, status: 'ACTIVE' },
      });

      const items: CreatedReservation['items'] = [];
      let subtotal = 0;
      // B-01 PERF: track gates we pre-decremented so we can roll them back on tx failure.
      const gatesConsumed: { key: string; qty: number }[] = [];

      for (const item of cart.items) {
        // Ensure WI row exists.
        await tx.$executeRaw`
          INSERT INTO "WarehouseInventory" ("warehouseId", "variantId", "stock", "reserved")
          VALUES (${whId}, ${item.variantId}, 0, 0)
          ON CONFLICT ("warehouseId", "variantId") DO NOTHING
        `;

        // B-01 PERF: Redis pre-gate ONLY for flash-sale items (contention is concentrated
        // on those SKUs during sale open). Non-flash items skip the gate entirely. The
        // gate caps the thundering herd before it hits the Postgres row-level lock.
        if (isFlash) {
          const gKey = reserveGateKey(whId, item.variantId);
          const gateResult = await this.redis.tryReserveGate(
            gKey,
            item.quantity,
          );
          if (gateResult === false) {
            // Definitive reject — Redis says stock is exhausted.
            throw new BadRequestException(
              `Insufficient stock for ${item.variant.sku} (${item.variant.product.name})`,
            );
          }
          if (gateResult === null) {
            // Cold cache (or Redis down) — lazily populate from Postgres sellable count.
            const wi = await tx.$queryRaw<{ sellable: number }[]>`
              SELECT ("stock" - "reserved")::int AS sellable
              FROM "WarehouseInventory"
              WHERE "warehouseId" = ${whId} AND "variantId" = ${item.variantId}
            `;
            const sellable = wi[0]?.sellable ?? 0;
            await this.redis.initReserveGate(
              gKey,
              sellable,
              RESERVE_GATE_TTL_SECONDS,
            );
            // After init, re-try the gate once. If it still can't be read (Redis down),
            // fall through to the authoritative Postgres path — safe because the
            // Postgres UPDATE below is itself conditional on sellable ≥ qty.
            const retry = await this.redis.tryReserveGate(gKey, item.quantity);
            if (retry === false) {
              throw new BadRequestException(
                `Insufficient stock for ${item.variant.sku} (${item.variant.product.name})`,
              );
            }
            if (retry === true)
              gatesConsumed.push({ key: gKey, qty: item.quantity });
          } else {
            gatesConsumed.push({ key: gKey, qty: item.quantity });
          }
        }

        // Conditional reserve on WI: sellable ≥ qty. Fails atomically on oversell.
        // Even if the Redis gate passed, Postgres remains authoritative (I-1).
        const rows = await tx.$executeRaw`
          UPDATE "WarehouseInventory"
          SET "reserved" = "reserved" + ${item.quantity}
          WHERE "warehouseId" = ${whId} AND "variantId" = ${item.variantId}
            AND ("stock" - "reserved") >= ${item.quantity}
        `;
        if (rows === 0) {
          // Postgres says no — roll back any Redis gates we already decremented
          // in this reservation attempt, then throw.
          for (const g of gatesConsumed) {
            await this.redis.releaseReserveGate(g.key, g.qty);
          }
          throw new BadRequestException(
            `Insufficient stock for ${item.variant.sku} (${item.variant.product.name})`,
          );
        }
        // Write-through cache sync on Variant.
        await tx.$executeRaw`
          UPDATE "Variant" SET "reservedStock" = "reservedStock" + ${item.quantity} WHERE id = ${item.variantId}
        `;

        const product = item.variant.product;
        const lockedPrice = product.basePrice * (1 - product.discountPct / 100);
        const lockedMrp = product.basePrice;

        await tx.cartReservationItem.create({
          data: {
            reservationId: parent.id,
            variantId: item.variantId,
            warehouseId: whId,
            quantity: item.quantity,
            lockedPrice,
            lockedMrp,
          },
        });
        items.push({
          variantId: item.variantId,
          quantity: item.quantity,
          lockedPrice,
          lockedMrp,
        });
        subtotal += lockedPrice * item.quantity;
      }

      return { reservationId: parent.id, expiresAt, items, subtotal };
    });
  }

  /**
   * Validate a reservation for use in placeOrder. Checks ownership, status,
   * expiry, and price drift against current product prices.
   */
  async validateForCheckout(
    reservationId: number,
    userId: number,
  ): Promise<{
    valid: boolean;
    reason?: string;
    changedItems?: {
      variantId: number;
      lockedPrice: number;
      currentPrice: number;
    }[];
    reservation?: Prisma.CartReservationGetPayload<{
      include: { items: true };
    }>;
  }> {
    // B-08 fix: select only price fields from Product — avoids loading description/images/etc.
    const reservation = await this.prisma.cartReservation.findUnique({
      where: { id: reservationId },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: {
                  select: { id: true, basePrice: true, discountPct: true },
                },
              },
            },
          },
        },
      },
    });
    if (!reservation) return { valid: false, reason: 'Reservation not found' };
    if (reservation.userId !== userId)
      return { valid: false, reason: 'Reservation does not belong to user' };
    if (reservation.status !== 'ACTIVE')
      return { valid: false, reason: `Reservation is ${reservation.status}` };
    if (reservation.expiresAt <= new Date())
      return { valid: false, reason: 'Reservation expired' };

    const changedItems: {
      variantId: number;
      lockedPrice: number;
      currentPrice: number;
    }[] = [];
    for (const it of reservation.items) {
      const p = it.variant.product;
      const currentPrice = p.basePrice * (1 - p.discountPct / 100);
      const drift = Math.abs(currentPrice - it.lockedPrice) / it.lockedPrice;
      if (drift > PRICE_DRIFT_TOLERANCE) {
        changedItems.push({
          variantId: it.variantId,
          lockedPrice: it.lockedPrice,
          currentPrice,
        });
      }
    }
    if (changedItems.length > 0)
      return { valid: false, reason: 'Price drift', changedItems };

    return { valid: true, reservation };
  }

  /**
   * Mark reservation CONSUMED after order placement. Does NOT decrement
   * WarehouseInventory.reserved — that reservation has been transferred to
   * the order and will be decremented on ship/cancel.
   *
   * Uses conditional WHERE status='ACTIVE' to prevent concurrent double-consumption:
   * if count=0, another concurrent placeOrder already consumed this reservation.
   */
  async consume(
    tx: Prisma.TransactionClient,
    reservationId: number,
  ): Promise<void> {
    const { count } = await tx.cartReservation.updateMany({
      where: { id: reservationId, status: 'ACTIVE' },
      data: { status: 'CONSUMED' },
    });
    if (count === 0) {
      throw new ConflictException(
        'Reservation already consumed or expired — duplicate order submission rejected',
      );
    }
  }

  /**
   * Explicitly release a reservation (user aborts checkout).
   * Decrements WarehouseInventory.reserved for every line + cache sync.
   */
  async releaseById(reservationId: number, userId: number): Promise<void> {
    const reservation = await this.prisma.cartReservation.findUnique({
      where: { id: reservationId },
      include: { items: true },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');
    if (reservation.userId !== userId)
      throw new NotFoundException('Reservation not found');
    if (reservation.status !== 'ACTIVE') return;

    // AUDIT A-1: conditional status flip FIRST inside the tx. If the expiry cron
    // (or another releaseById caller) already flipped this row between our pre-tx
    // read and now, `updateMany` returns count=0 and we skip the WI decrement —
    // preventing double-decrement that would drive Variant.reservedStock below
    // the true active-order tally (I-2 violation). Only when we observe the
    // ACTIVE→EXPIRED transition do we own the WI release.
    const didExpire = await this.prisma.$transaction(async (tx) => {
      const flip = await tx.cartReservation.updateMany({
        where: { id: reservationId, status: 'ACTIVE' },
        data: { status: 'EXPIRED' },
      });
      if (flip.count === 0) return false; // someone else already expired it
      for (const it of reservation.items) {
        await tx.$executeRaw`
          UPDATE "WarehouseInventory"
          SET "reserved" = GREATEST(0, "reserved" - ${it.quantity})
          WHERE "warehouseId" = ${it.warehouseId} AND "variantId" = ${it.variantId}
        `;
        await tx.$executeRaw`
          UPDATE "Variant"
          SET "reservedStock" = GREATEST(0, "reservedStock" - ${it.quantity})
          WHERE id = ${it.variantId}
        `;
      }
      return true;
    });

    // B-01 PERF: release Redis gate tokens post-commit. Only if WE actually
    // performed the ACTIVE→EXPIRED transition — otherwise the other caller
    // will (or already has) released them. Flash reservations only.
    if (didExpire && reservation.isFlash) {
      for (const it of reservation.items) {
        await this.redis.releaseReserveGate(
          reserveGateKey(it.warehouseId, it.variantId),
          it.quantity,
        );
      }
    }
  }

  /** Return active reservation id for a user's cart, if one exists. */
  async getActiveForUser(
    userId: number,
  ): Promise<{ id: number; expiresAt: Date } | null> {
    const row = await this.prisma.cartReservation.findFirst({
      where: { userId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, expiresAt: true },
    });
    return row;
  }

  /** Enforce 3-concurrent cap: if user at limit, expire oldest ACTIVE reservation. */
  private async enforceConcurrentCap(userId: number): Promise<void> {
    const active = await this.prisma.cartReservation.findMany({
      where: { userId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
      include: { items: true },
    });
    if (active.length < MAX_CONCURRENT_RESERVATIONS_PER_USER) return;
    const toKill = active.slice(
      0,
      active.length - MAX_CONCURRENT_RESERVATIONS_PER_USER + 1,
    );
    for (const r of toKill) {
      await this.releaseById(r.id, userId).catch(() => {});
    }
  }

  // ─── Back-compat wrappers (used by existing controller/orders paths) ─────────

  /** @deprecated use createReservation() — returns void for controller back-compat. */
  async reserveCartItems(userId: number): Promise<CreatedReservation> {
    // Release any existing active reservation for this cart so the new one is authoritative.
    const existing = await this.getActiveForUser(userId);
    if (existing) await this.releaseById(existing.id, userId).catch(() => {});
    return this.createReservation(userId);
  }

  async hasValidReservation(userId: number): Promise<boolean> {
    return (await this.getActiveForUser(userId)) !== null;
  }

  /** @deprecated use validateForCheckout(reservationId, userId) */
  async validatePriceLock(userId: number): Promise<{
    valid: boolean;
    changedItems: {
      variantId: number;
      lockedPrice: number;
      currentPrice: number;
    }[];
  }> {
    const active = await this.getActiveForUser(userId);
    if (!active) return { valid: true, changedItems: [] };
    const r = await this.validateForCheckout(active.id, userId);
    return { valid: r.valid, changedItems: r.changedItems ?? [] };
  }

  /** @deprecated use validateForCheckout → reservation.items */
  async getLockedPrices(userId: number): Promise<Map<number, number>> {
    const active = await this.getActiveForUser(userId);
    if (!active) return new Map();
    const items = await this.prisma.cartReservationItem.findMany({
      where: { reservationId: active.id },
      select: { variantId: true, lockedPrice: true },
    });
    return new Map(items.map((i) => [i.variantId, i.lockedPrice]));
  }

  /** @deprecated — release active reservation for a user (no reservationId). */
  async releaseReservation(userId: number): Promise<void> {
    const active = await this.getActiveForUser(userId);
    if (active) await this.releaseById(active.id, userId).catch(() => {});
  }

  // ─── Expiry cron ─────────────────────────────────────────────────────────────

  /**
   * B-02 PERF: batch expiry via single CTE. Replaces serial per-row transaction
   * (N round-trips + N tx commits) with one data-modifying CTE that:
   *   1. Locks + flips ACTIVE→EXPIRED rows past their TTL (SKIP LOCKED avoids
   *      contention with concurrent consume/release callers — B-12 preserved)
   *   2. Aggregates item quantities per (warehouse, variant)
   *   3. Decrements WarehouseInventory.reserved in one UPDATE
   *   4. Syncs Variant.reservedStock cache in one UPDATE
   *
   * Single CTE = single tx, single network round-trip, atomic. Scales ~50x
   * over the old serial loop when the backlog is >100 reservations
   * (critical during flash-sale endings).
   */
  @Cron('*/1 * * * *')
  async expireOldReservations(): Promise<void> {
    await withCronMetric('cart-reservation-expiry', () =>
      this.cronLock.runExclusive(
        'cart-reservation-expiry',
        50_000,
        async () => {
          // AUDIT A-3: snapshot + CTE MUST share one tx so `FOR UPDATE SKIP LOCKED`
          // locks persist across both statements. Without the surrounding tx, Prisma
          // autocommits each raw call and the row locks release immediately — making
          // SKIP LOCKED decorative. Correctness would still hold via the CTE's inner
          // `status='ACTIVE'` guard, but two pods would pointlessly rescan the same
          // 500 IDs. Wrapping keeps scan exclusivity and matches the comment intent.
          const flashItems = await this.prisma.$transaction(async (tx) => {
            // Step 1: snapshot candidate IDs + isFlash flag with SKIP LOCKED so we
            // don't starve the consume() path when a user is mid-checkout on an
            // about-to-expire row. isFlash is needed so we can release Redis gates
            // (B-01) for flash reservations after the CTE commits.
            const rows = await tx.$queryRaw<{ id: number; isFlash: boolean }[]>`
          SELECT id, "isFlash" FROM "CartReservation"
          WHERE "status" = 'ACTIVE' AND "expiresAt" <= NOW()
          ORDER BY "expiresAt" ASC
          LIMIT 500
          FOR UPDATE SKIP LOCKED
        `;
            if (rows.length === 0)
              return [] as {
                warehouseId: number;
                variantId: number;
                quantity: number;
              }[];
            const ids = rows.map((r) => r.id);
            const flashIds = rows.filter((r) => r.isFlash).map((r) => r.id);

            // Pre-fetch flash item details so we can release Redis gates post-commit.
            const flash =
              flashIds.length > 0
                ? await tx.cartReservationItem.findMany({
                    where: { reservationId: { in: flashIds } },
                    select: {
                      warehouseId: true,
                      variantId: true,
                      quantity: true,
                    },
                  })
                : [];

            // Step 2: single CTE releases inventory + syncs cache atomically.
            // The inner UPDATE re-checks status='ACTIVE' so a concurrent consume()
            // that won the SKIP LOCKED race still causes the row to be excluded
            // from the expired CTE (B-12 race-safety preserved).
            await tx.$executeRaw`
        WITH expired AS (
          UPDATE "CartReservation"
          SET "status" = 'EXPIRED'
          WHERE "id" = ANY(${ids}::int[]) AND "status" = 'ACTIVE'
          RETURNING "id"
        ),
        items_agg AS (
          SELECT cri."warehouseId", cri."variantId", SUM(cri."quantity")::int AS qty
          FROM "CartReservationItem" cri
          JOIN expired e ON cri."reservationId" = e."id"
          GROUP BY cri."warehouseId", cri."variantId"
        ),
        variant_agg AS (
          SELECT "variantId", SUM(qty)::int AS qty
          FROM items_agg
          GROUP BY "variantId"
        ),
        wi_upd AS (
          UPDATE "WarehouseInventory" wi
          SET "reserved" = GREATEST(0, wi."reserved" - ia."qty")
          FROM items_agg ia
          WHERE wi."warehouseId" = ia."warehouseId"
            AND wi."variantId"   = ia."variantId"
          RETURNING 1
        )
          UPDATE "Variant" v
          SET "reservedStock" = GREATEST(0, v."reservedStock" - va."qty")
          FROM variant_agg va
          WHERE v."id" = va."variantId"
        `;

            this.logger.log(
              `Expired ${ids.length} cart reservations (batch CTE)`,
            );
            return flash;
          });

          // B-01 PERF: release Redis gate tokens for expired flash reservations.
          // Post-tx + best-effort: gate is advisory, drift self-heals on next flash-sale start.
          for (const it of flashItems) {
            await this.redis.releaseReserveGate(
              reserveGateKey(it.warehouseId, it.variantId),
              it.quantity,
            );
          }
        },
      ),
    );
  }
}
