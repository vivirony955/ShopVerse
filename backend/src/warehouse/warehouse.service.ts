// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWarehouseDto, UpdateInventoryDto } from './dto/create-warehouse.dto';
import { ShipmentStatus } from '@prisma/client';

@Injectable()
export class WarehouseService {
  private readonly logger = new Logger(WarehouseService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createWarehouse(dto: CreateWarehouseDto) {
    return this.prisma.warehouse.create({ data: dto });
  }

  async listWarehouses() {
    return this.prisma.warehouse.findMany({ where: { isActive: true } });
  }

  async getWarehouse(id: number) {
    const wh = await this.prisma.warehouse.findUnique({
      where: { id },
      include: { inventory: { include: { variant: true } } },
    });
    if (!wh) throw new NotFoundException('Warehouse not found');
    return wh;
  }

  /**
   * Update or upsert stock for a variant at a warehouse (FINAL §7.1).
   * Variant.stock is the write-through cache: recompute it from the sum of
   * WarehouseInventory.stock across all warehouses, in the same transaction.
   */
  async updateInventory(dto: UpdateInventoryDto) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.warehouseInventory.upsert({
        where: { warehouseId_variantId: { warehouseId: dto.warehouseId, variantId: dto.variantId } },
        create: { warehouseId: dto.warehouseId, variantId: dto.variantId, stock: dto.stock },
        update: { stock: dto.stock },
      });
      await this.syncVariantCache(tx, dto.variantId);
      return row;
    });
  }

  /**
   * Write-through cache sync: recompute Variant.stock and Variant.reservedStock
   * from the sum of WarehouseInventory rows. Called inside every inventory-mutating
   * transaction so the cache invariant (I-1) holds.
   */
  private async syncVariantCache(tx: any, variantId: number): Promise<void> {
    await tx.$executeRaw`
      UPDATE "Variant" SET
        "stock" = COALESCE((SELECT SUM("stock")::int FROM "WarehouseInventory" WHERE "variantId" = ${variantId}), 0),
        "reservedStock" = COALESCE((SELECT SUM("reserved")::int FROM "WarehouseInventory" WHERE "variantId" = ${variantId}), 0)
      WHERE id = ${variantId}
    `;
  }

  /**
   * Smart order routing: find best warehouse for an order.
   * Priority: 1) has all items in stock, 2) closest to delivery pincode.
   * Falls back to splitting across warehouses if needed.
   */
  async routeOrder(orderId: number, deliveryPincode: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    // B-09 / P-14 PERF: scope inventory include to the order's variants only.
    // Old query loaded the entire WI table per warehouse (fatal at Phase 2 scale
    // ~500k rows). Now fetches at most N_wh × N_orderItems rows.
    const orderVariantIds = order.items.map((i) => i.variantId);
    const warehouses = await this.prisma.warehouse.findMany({
      where: { isActive: true },
      include: {
        inventory: {
          where: { variantId: { in: orderVariantIds } },
        },
      },
    });

    // Attempt single-warehouse fulfillment first
    for (const wh of warehouses) {
      const canFulfill = order.items.every((item) => {
        const inv = wh.inventory.find((i) => i.variantId === item.variantId);
        return inv && inv.stock - inv.reserved >= item.quantity;
      });
      if (canFulfill) {
        return this.createShipment(orderId, wh.id, order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })));
      }
    }

    // Split fulfillment across warehouses
    const assignments: Map<number, { variantId: number; quantity: number }[]> = new Map();
    for (const item of order.items) {
      let remaining = item.quantity;
      for (const wh of warehouses) {
        if (remaining === 0) break;
        const inv = wh.inventory.find((i) => i.variantId === item.variantId);
        if (!inv) continue;
        const available = inv.stock - inv.reserved;
        if (available <= 0) continue;
        const take = Math.min(available, remaining);
        if (!assignments.has(wh.id)) assignments.set(wh.id, []);
        assignments.get(wh.id)!.push({ variantId: item.variantId, quantity: take });
        remaining -= take;
      }
      if (remaining > 0) {
        throw new BadRequestException(`Insufficient stock for variant ${item.variantId}`);
      }
    }

    const shipments: any[] = [];
    for (const [whId, items] of assignments.entries()) {
      shipments.push(await this.createShipment(orderId, whId, items));
    }
    return shipments;
  }

  private async createShipment(
    orderId: number,
    warehouseId: number,
    items: { variantId: number; quantity: number }[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Reserve inventory + write-through cache sync
      for (const item of items) {
        await tx.warehouseInventory.updateMany({
          where: { warehouseId, variantId: item.variantId },
          data: { reserved: { increment: item.quantity } },
        });
        await this.syncVariantCache(tx, item.variantId);
      }
      return tx.shipment.create({
        data: {
          orderId,
          warehouseId,
          status: ShipmentStatus.PENDING,
          items: {
            create: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
          },
        },
        include: { items: true },
      });
    });
  }

  async updateShipmentStatus(shipmentId: number, status: ShipmentStatus, trackingCode?: string) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) throw new NotFoundException('Shipment not found');

    const updated = await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        status,
        ...(trackingCode ? { trackingCode } : {}),
        ...(status === ShipmentStatus.DELIVERED ? { deliveredAt: new Date() } : {}),
      },
    });

    // If delivered, release inventory reservation + sync Variant cache
    if (status === ShipmentStatus.DELIVERED) {
      const items = await this.prisma.shipmentItem.findMany({ where: { shipmentId } });
      await this.prisma.$transaction(async (tx) => {
        for (const item of items) {
          await tx.warehouseInventory.updateMany({
            where: { warehouseId: shipment.warehouseId, variantId: item.variantId },
            data: { reserved: { decrement: item.quantity }, stock: { decrement: item.quantity } },
          });
          await this.syncVariantCache(tx, item.variantId);
        }
      });
    }

    // ─── RTO: failed delivery — restore stock, update order, log event ───────────
    if (status === ShipmentStatus.RTO) {
      const items = await this.prisma.shipmentItem.findMany({ where: { shipmentId } });
      await this.prisma.$transaction(async (tx) => {
        for (const item of items) {
          // Restore warehouse inventory: release reservation and add stock back
          await tx.warehouseInventory.updateMany({
            where: { warehouseId: shipment.warehouseId, variantId: item.variantId },
            data: { reserved: { decrement: item.quantity }, stock: { increment: item.quantity } },
          });
          // Variant cache is the sum across warehouses — recompute rather than
          // apply diffs (protects against drift if admin touched another WH row).
          await this.syncVariantCache(tx, item.variantId);
        }
        // Mark order as RTO so ops team can act
        await tx.order.update({
          where: { id: shipment.orderId },
          data: { status: 'RETURN_REQUESTED' as any },
        });
        await tx.trackingEvent.create({
          data: {
            orderId: shipment.orderId,
            status: 'RETURN_REQUESTED' as any,
            note: `RTO: shipment #${shipmentId} returned to warehouse. Stock restored.`,
          },
        });
      });
      this.logger.warn(`RTO processed for shipment #${shipmentId}, order #${shipment.orderId}`);
    }

    return updated;
  }

  async getOrderShipments(orderId: number) {
    return this.prisma.shipment.findMany({
      where: { orderId },
      include: { items: { include: { variant: { include: { product: true } } } }, warehouse: true },
    });
  }

  /**
   * Split order fulfillment: creates one child order per warehouse group.
   * Use when an order's items must ship from multiple warehouses and you want
   * separate order IDs for billing/tracking per warehouse.
   */
  async splitOrderByWarehouse(orderId: number, deliveryPincode: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    // B-09 / P-14 PERF: scope inventory include to the order's variants only.
    // Old query loaded the entire WI table per warehouse (fatal at Phase 2 scale
    // ~500k rows). Now fetches at most N_wh × N_orderItems rows.
    const orderVariantIds = order.items.map((i) => i.variantId);
    const warehouses = await this.prisma.warehouse.findMany({
      where: { isActive: true },
      include: {
        inventory: {
          where: { variantId: { in: orderVariantIds } },
        },
      },
    });

    // Map each item to the best warehouse that can fulfill it
    const warehouseItems = new Map<number, { variantId: number; quantity: number; price: number }[]>();

    for (const item of order.items) {
      let assigned = false;
      for (const wh of warehouses) {
        const inv = wh.inventory.find((i) => i.variantId === item.variantId);
        if (inv && inv.stock - inv.reserved >= item.quantity) {
          if (!warehouseItems.has(wh.id)) warehouseItems.set(wh.id, []);
          warehouseItems.get(wh.id)!.push({ variantId: item.variantId, quantity: item.quantity, price: item.price });
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        throw new BadRequestException(`Cannot find warehouse stock for variant #${item.variantId}`);
      }
    }

    if (warehouseItems.size <= 1) {
      // No split needed — single warehouse can fulfill
      return [{ orderId, warehouseId: warehouseItems.keys().next().value, split: false }];
    }

    // Create sub-orders per warehouse inside a transaction
    const subOrders: { orderId: number; warehouseId: number; split: boolean }[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const [warehouseId, items] of warehouseItems.entries()) {
        const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
        const subOrder = await tx.order.create({
          data: {
            userId: order.userId,
            guestEmail: order.guestEmail,
            addressSnapshot: order.addressSnapshot as any,
            subtotal,
            discountAmount: 0,
            total: subtotal,
            status: 'CONFIRMED' as any,
            paymentStatus: order.paymentStatus,
            parentOrderId: orderId,
            items: { create: items },
          },
        });
        subOrders.push({ orderId: subOrder.id, warehouseId, split: true });

        // Create shipment for sub-order
        await tx.shipment.create({
          data: {
            orderId: subOrder.id,
            warehouseId,
            status: ShipmentStatus.PENDING,
            items: { create: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })) },
          },
        });

        // Reserve warehouse inventory + sync Variant cache
        for (const item of items) {
          await tx.warehouseInventory.updateMany({
            where: { warehouseId, variantId: item.variantId },
            data: { reserved: { increment: item.quantity } },
          });
          await this.syncVariantCache(tx, item.variantId);
        }
      }

      // Mark original order as split/processing
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'PROCESSING' as any },
      });
    });

    return subOrders;
  }

  /**
   * Batch picking list: groups all PROCESSING order items for a warehouse by variant.
   * Gives warehouse staff a single consolidated list to pick from shelves.
   */
  async getBatchPickList(warehouseId: number, date?: string) {
    const wh = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!wh) throw new NotFoundException('Warehouse not found');

    // Get all pending shipments for this warehouse
    const shipments = await this.prisma.shipment.findMany({
      where: {
        warehouseId,
        status: ShipmentStatus.PENDING,
        ...(date ? { createdAt: { gte: new Date(date), lt: new Date(new Date(date).getTime() + 86400000) } } : {}),
      },
      include: {
        items: { include: { variant: { include: { product: { select: { name: true, images: true } } } } } },
        order: { select: { id: true, status: true } },
      },
    });

    // Consolidate: group by variant, sum quantities across all shipments
    const consolidated = new Map<number, {
      variantId: number;
      sku: string;
      productName: string;
      size: string;
      color: string;
      totalQty: number;
      shipmentIds: number[];
    }>();

    for (const shipment of shipments) {
      for (const item of shipment.items) {
        const existing = consolidated.get(item.variantId);
        if (existing) {
          existing.totalQty += item.quantity;
          existing.shipmentIds.push(shipment.id);
        } else {
          consolidated.set(item.variantId, {
            variantId: item.variantId,
            sku: item.variant.sku,
            productName: item.variant.product.name,
            size: item.variant.size,
            color: item.variant.color,
            totalQty: item.quantity,
            shipmentIds: [shipment.id],
          });
        }
      }
    }

    return {
      warehouse: { id: wh.id, name: wh.name },
      date: date ?? new Date().toISOString().split('T')[0],
      totalShipments: shipments.length,
      pickList: Array.from(consolidated.values()).sort((a, b) => a.sku.localeCompare(b.sku)),
    };
  }

  /** RTO report: all RTO shipments in a date range for ops review */
  async getRtoReport(from: Date, to: Date) {
    return this.prisma.shipment.findMany({
      where: { status: ShipmentStatus.RTO, updatedAt: { gte: from, lte: to } },
      include: {
        order: { select: { id: true, userId: true, total: true, guestEmail: true } },
        warehouse: { select: { id: true, name: true } },
        items: { include: { variant: { select: { sku: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
}
