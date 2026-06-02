// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Canonical inventory movement service (FINAL §7.1, §7.3 — R-001).
 *
 * WarehouseInventory is the AUTHORITATIVE store for stock/reserved.
 * Variant.stock / Variant.reservedStock are write-through caches
 * (what §7.1 calls `Variant.stockCache`) kept in sync inside the same
 * transaction as every WarehouseInventory mutation.
 *
 * Phase 1: single DEFAULT warehouse. Phase 2 will introduce smart
 * proximity-scored routing across multiple warehouses.
 *
 * Stock lifecycle
 * ───────────────
 *   place order     → reserve          WI.reserved += qty;    Variant.reservedStock += qty
 *   cancel pre-ship → release          WI.reserved -= qty;    Variant.reservedStock -= qty
 *   ship / fulfil   → commitShipment   WI.stock -= qty, WI.reserved -= qty;
 *                                       Variant.stock -= qty, Variant.reservedStock -= qty
 *   return / RTO    → restock          WI.stock += qty;       Variant.stock += qty
 *
 * All mutations are expressed as conditional raw-SQL updates so the database
 * enforces invariants (stock ≥ 0, reserved ≥ 0, reserved ≤ stock) even under
 * concurrent writers. Callers MUST pass a Prisma transaction client.
 */
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);
  private defaultWarehouseId: number | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Resolve (and cache) the Phase-1 DEFAULT warehouse id. */
  private async getDefaultWarehouseId(
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    if (this.defaultWarehouseId !== null) return this.defaultWarehouseId;
    const wh = await tx.warehouse.findUnique({ where: { code: 'DEFAULT' } });
    if (!wh) {
      throw new Error(
        'DEFAULT warehouse not seeded. Apply migration 20260405000000_final_warehouse_authoritative.',
      );
    }
    this.defaultWarehouseId = wh.id;
    return wh.id;
  }

  /** Ensure a WarehouseInventory row exists for (warehouse, variant); return it. */
  private async ensureRow(
    tx: Prisma.TransactionClient,
    warehouseId: number,
    variantId: number,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO "WarehouseInventory" ("warehouseId", "variantId", "stock", "reserved")
      VALUES (${warehouseId}, ${variantId}, 0, 0)
      ON CONFLICT ("warehouseId", "variantId") DO NOTHING
    `;
  }

  /** Reserve `qty` units for a variant. Throws if sellable stock is insufficient. */
  async reserve(
    tx: Prisma.TransactionClient,
    variantId: number,
    qty: number,
    opts: { allowBackorder?: boolean } = {},
  ): Promise<void> {
    if (qty <= 0)
      throw new BadRequestException('Reserve quantity must be positive');
    const whId = await this.getDefaultWarehouseId(tx);
    await this.ensureRow(tx, whId, variantId);

    if (opts.allowBackorder) {
      // Backorder: reserve without verifying physical stock.
      // Since WI.reserved ≤ stock is a CHECK constraint, backorders must grow stock
      // in lockstep. For Phase 1 this is expressed by also incrementing stock — the
      // balancing entry will be a PO receipt later.
      await tx.$executeRaw`
        UPDATE "WarehouseInventory"
        SET "stock" = "stock" + ${qty}, "reserved" = "reserved" + ${qty}
        WHERE "warehouseId" = ${whId} AND "variantId" = ${variantId}
      `;
      await tx.$executeRaw`
        UPDATE "Variant"
        SET "stock" = "stock" + ${qty}, "reservedStock" = "reservedStock" + ${qty}
        WHERE id = ${variantId}
      `;
      return;
    }

    // Conditional reserve: only succeeds when sellable (stock - reserved) ≥ qty.
    const rows = await tx.$executeRaw`
      UPDATE "WarehouseInventory"
      SET "reserved" = "reserved" + ${qty}
      WHERE "warehouseId" = ${whId}
        AND "variantId" = ${variantId}
        AND ("stock" - "reserved") >= ${qty}
    `;
    if (rows === 0) {
      throw new BadRequestException(
        `Insufficient sellable stock for variant ${variantId}`,
      );
    }
    // Write-through cache update on Variant. The CHECK on Variant (reservedStock ≤ stock)
    // is preserved because we just debited the same amount from WI which obeys its own CHECK.
    await tx.$executeRaw`
      UPDATE "Variant" SET "reservedStock" = "reservedStock" + ${qty} WHERE id = ${variantId}
    `;
  }

  /** Release `qty` previously-reserved units (pre-shipment cancel / reservation expiry). */
  async release(
    tx: Prisma.TransactionClient,
    variantId: number,
    qty: number,
  ): Promise<void> {
    if (qty <= 0) return;
    const whId = await this.getDefaultWarehouseId(tx);
    // Clamp at zero so double-release can't drive reserved negative.
    const rows = await tx.$executeRaw`
      UPDATE "WarehouseInventory"
      SET "reserved" = GREATEST(0, "reserved" - ${qty})
      WHERE "warehouseId" = ${whId} AND "variantId" = ${variantId}
    `;
    if (rows === 0) {
      this.logger.warn(
        `release() no-op: WI row missing for variant ${variantId}`,
      );
      return;
    }
    await tx.$executeRaw`
      UPDATE "Variant"
      SET "reservedStock" = GREATEST(0, "reservedStock" - ${qty})
      WHERE id = ${variantId}
    `;
  }

  /**
   * Commit a reservation to a shipment: decrement both stock and reserved by `qty`
   * on WarehouseInventory AND on the Variant cache. This is the moment physical
   * inventory actually leaves the warehouse.
   */
  async commitShipment(
    tx: Prisma.TransactionClient,
    variantId: number,
    qty: number,
  ): Promise<void> {
    if (qty <= 0) return;
    const whId = await this.getDefaultWarehouseId(tx);
    const rows = await tx.$executeRaw`
      UPDATE "WarehouseInventory"
      SET "stock" = "stock" - ${qty}, "reserved" = "reserved" - ${qty}
      WHERE "warehouseId" = ${whId}
        AND "variantId" = ${variantId}
        AND "stock" >= ${qty}
        AND "reserved" >= ${qty}
    `;
    if (rows === 0) {
      throw new BadRequestException(
        `Cannot commit shipment for variant ${variantId}: invariant violation (stock/reserved < qty)`,
      );
    }
    await tx.$executeRaw`
      UPDATE "Variant"
      SET "stock" = "stock" - ${qty},
          "reservedStock" = "reservedStock" - ${qty},
          "soldCount" = "soldCount" + ${qty}
      WHERE id = ${variantId}
    `;
  }

  /** Add `qty` units back to physical stock (return intake, RTO, PO receipt). */
  async restock(
    tx: Prisma.TransactionClient,
    variantId: number,
    qty: number,
  ): Promise<void> {
    if (qty <= 0) return;
    const whId = await this.getDefaultWarehouseId(tx);
    await this.ensureRow(tx, whId, variantId);
    await tx.$executeRaw`
      UPDATE "WarehouseInventory" SET "stock" = "stock" + ${qty}
      WHERE "warehouseId" = ${whId} AND "variantId" = ${variantId}
    `;
    await tx.$executeRaw`
      UPDATE "Variant" SET "stock" = "stock" + ${qty} WHERE id = ${variantId}
    `;
  }

  /** Read-only: sellable (available-to-promise) quantity for a variant across all warehouses. */
  async sellable(variantId: number): Promise<number> {
    const rows = await this.prisma.warehouseInventory.findMany({
      where: { variantId },
      select: { stock: true, reserved: true },
    });
    return rows.reduce((sum, r) => sum + Math.max(0, r.stock - r.reserved), 0);
  }
}
