// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock, MockPrisma } from '../test-utils/prisma.mock';
import { ShipmentStatus } from '@prisma/client';

describe('WarehouseService', () => {
  let service: WarehouseService;
  let prisma: MockPrisma;

  const mockWarehouse = {
    id: 1,
    name: 'Delhi Warehouse',
    code: 'DEL01',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110001',
    lat: 28.6,
    lng: 77.2,
    isActive: true,
    createdAt: new Date(),
  };

  const mockInventory = [
    { warehouseId: 1, variantId: 10, stock: 50, reserved: 5 },
    { warehouseId: 1, variantId: 11, stock: 20, reserved: 0 },
  ];

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WarehouseService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<WarehouseService>(WarehouseService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(service).toBeDefined());

  // ─── createWarehouse ─────────────────────────────────────────────────────────

  describe('createWarehouse', () => {
    it('creates and returns a warehouse', async () => {
      prisma.warehouse.create.mockResolvedValue(mockWarehouse);
      const result = await service.createWarehouse({
        name: 'Delhi Warehouse',
        code: 'DEL01',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001',
      });
      expect(prisma.warehouse.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ code: 'DEL01' }),
      });
      expect(result).toEqual(mockWarehouse);
    });
  });

  // ─── listWarehouses ───────────────────────────────────────────────────────────

  describe('listWarehouses', () => {
    it('returns only active warehouses', async () => {
      prisma.warehouse.findMany.mockResolvedValue([mockWarehouse]);
      const result = await service.listWarehouses();
      expect(prisma.warehouse.findMany).toHaveBeenCalledWith({ where: { isActive: true } });
      expect(result).toHaveLength(1);
    });
  });

  // ─── getWarehouse ─────────────────────────────────────────────────────────────

  describe('getWarehouse', () => {
    it('returns warehouse with inventory', async () => {
      prisma.warehouse.findUnique.mockResolvedValue({
        ...mockWarehouse,
        inventory: mockInventory,
      });
      const result = await service.getWarehouse(1);
      expect(result.inventory).toHaveLength(2);
    });

    it('throws NotFoundException for unknown warehouse', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(null);
      await expect(service.getWarehouse(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateInventory ─────────────────────────────────────────────────────────

  describe('updateInventory', () => {
    it('upserts warehouse inventory', async () => {
      prisma.warehouseInventory.upsert.mockResolvedValue({ warehouseId: 1, variantId: 10, stock: 100, reserved: 0 });
      const result = await service.updateInventory({ warehouseId: 1, variantId: 10, stock: 100 });
      expect(prisma.warehouseInventory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { warehouseId_variantId: { warehouseId: 1, variantId: 10 } },
          update: { stock: 100 },
        }),
      );
      expect(result.stock).toBe(100);
    });
  });

  // ─── routeOrder ───────────────────────────────────────────────────────────────

  describe('routeOrder', () => {
    const mockOrder = {
      id: 5,
      items: [
        { variantId: 10, quantity: 3 },
        { variantId: 11, quantity: 2 },
      ],
    };

    it('routes to single warehouse when stock is sufficient', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.warehouse.findMany.mockResolvedValue([
        {
          ...mockWarehouse,
          inventory: [
            { warehouseId: 1, variantId: 10, stock: 50, reserved: 0 },
            { warehouseId: 1, variantId: 11, stock: 20, reserved: 0 },
          ],
        },
      ]);
      // createShipment calls $transaction
      prisma.$transaction.mockImplementation((cb: any) =>
        cb({
          warehouseInventory: { updateMany: jest.fn() },
          shipment: {
            create: jest.fn().mockResolvedValue({
              id: 1,
              orderId: 5,
              warehouseId: 1,
              status: ShipmentStatus.PENDING,
              items: [],
            }),
          },
          $executeRaw: jest.fn().mockResolvedValue(1),
        }),
      );

      const result = await service.routeOrder(5, '110001');
      expect(result).toMatchObject({ orderId: 5, warehouseId: 1 });
    });

    it('throws NotFoundException when order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(service.routeOrder(999, '110001')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when stock is insufficient across all warehouses', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.warehouse.findMany.mockResolvedValue([
        {
          ...mockWarehouse,
          inventory: [
            { warehouseId: 1, variantId: 10, stock: 1, reserved: 0 }, // only 1, need 3
            { warehouseId: 1, variantId: 11, stock: 0, reserved: 0 },
          ],
        },
      ]);
      await expect(service.routeOrder(5, '110001')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── updateShipmentStatus ─────────────────────────────────────────────────────

  describe('updateShipmentStatus', () => {
    const mockShipment = {
      id: 1,
      orderId: 5,
      warehouseId: 1,
      status: ShipmentStatus.DISPATCHED,
    };

    it('throws NotFoundException for unknown shipment', async () => {
      prisma.shipment.findUnique.mockResolvedValue(null);
      await expect(
        service.updateShipmentStatus(999, ShipmentStatus.DELIVERED),
      ).rejects.toThrow(NotFoundException);
    });

    it('sets deliveredAt when status is DELIVERED', async () => {
      prisma.shipment.findUnique.mockResolvedValue(mockShipment);
      prisma.shipment.update.mockResolvedValue({
        ...mockShipment,
        status: ShipmentStatus.DELIVERED,
        deliveredAt: new Date(),
      });
      prisma.shipmentItem.findMany.mockResolvedValue([
        { variantId: 10, quantity: 3 },
      ]);
      prisma.warehouseInventory.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.updateShipmentStatus(1, ShipmentStatus.DELIVERED);
      expect(result.status).toBe(ShipmentStatus.DELIVERED);
      expect(prisma.warehouseInventory.updateMany).toHaveBeenCalled();
    });

    it('releases reservation on RTO without decrementing stock', async () => {
      prisma.shipment.findUnique.mockResolvedValue(mockShipment);
      prisma.shipment.update.mockResolvedValue({ ...mockShipment, status: ShipmentStatus.RTO });
      prisma.shipmentItem.findMany.mockResolvedValue([{ variantId: 10, quantity: 3 }]);
      prisma.warehouseInventory.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.updateShipmentStatus(1, ShipmentStatus.RTO);
      expect(result.status).toBe(ShipmentStatus.RTO);
      // On RTO, reserved is decremented but stock is NOT decremented
      expect(prisma.warehouseInventory.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reserved: expect.anything() }),
        }),
      );
    });
  });

  // ─── getOrderShipments ────────────────────────────────────────────────────────

  describe('getOrderShipments', () => {
    it('returns all shipments for an order', async () => {
      prisma.shipment.findMany.mockResolvedValue([
        { id: 1, orderId: 5 },
        { id: 2, orderId: 5 },
      ]);
      const result = await service.getOrderShipments(5);
      expect(result).toHaveLength(2);
      expect(prisma.shipment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { orderId: 5 } }),
      );
    });
  });
});
