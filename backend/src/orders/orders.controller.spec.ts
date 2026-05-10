// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AuthenticatedRequest } from '../common/types';

describe('OrdersController', () => {
  let controller: OrdersController;

  const mockOrdersService = {
    getUserOrders: jest.fn(),
    getOrderById: jest.fn(),
    placeOrder: jest.fn(),
    cancelOrder: jest.fn(),
    requestReturn: jest.fn(),
    getAllOrders: jest.fn(),
    updateOrderStatus: jest.fn(),
  };

  const mockReq = {
    user: { id: 1, role: 'USER' },
    ip: '127.0.0.1',
    headers: {},
  } as unknown as AuthenticatedRequest;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: mockOrdersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OrdersController>(OrdersController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── getUserOrders ────────────────────────────────────────────────────────

  describe('getUserOrders', () => {
    it("returns the current user's orders", async () => {
      const orders = [{ id: 1, status: 'PENDING' }];
      mockOrdersService.getUserOrders.mockResolvedValue(orders);
      const result = await controller.getUserOrders(mockReq);
      expect(result).toEqual(orders);
      expect(mockOrdersService.getUserOrders).toHaveBeenCalledWith(1);
    });
  });

  // ─── getOrder ─────────────────────────────────────────────────────────────

  describe('getOrder', () => {
    it('returns a specific order by id', async () => {
      const order = { id: 1, status: 'CONFIRMED' };
      mockOrdersService.getOrderById.mockResolvedValue(order);
      const result = await controller.getOrder(mockReq, 1);
      expect(result).toEqual(order);
      expect(mockOrdersService.getOrderById).toHaveBeenCalledWith(1, 1);
    });
  });

  // ─── placeOrder ───────────────────────────────────────────────────────────

  describe('placeOrder', () => {
    it('places an order and returns it', async () => {
      const order = { id: 5, total: 1499, status: 'PENDING' };
      mockOrdersService.placeOrder.mockResolvedValue(order);
      const result = await controller.placeOrder(mockReq, {
        addressId: 2,
        reservationId: 1,
      });
      expect(result).toEqual(order);
      expect(mockOrdersService.placeOrder).toHaveBeenCalledWith(
        1,
        { addressId: 2, reservationId: 1 },
        expect.any(Object),
      );
    });
  });

  // ─── cancelOrder ──────────────────────────────────────────────────────────

  describe('cancelOrder', () => {
    it('cancels an order and returns message', async () => {
      mockOrdersService.cancelOrder.mockResolvedValue({
        message: 'Order cancelled successfully',
      });
      const result = await controller.cancelOrder(mockReq, 1);
      expect(result).toEqual({ message: 'Order cancelled successfully' });
    });
  });

  // ─── requestReturn ────────────────────────────────────────────────────────

  describe('requestReturn', () => {
    it('marks order as RETURN_REQUESTED', async () => {
      const updated = { id: 1, status: 'RETURN_REQUESTED' };
      mockOrdersService.requestReturn.mockResolvedValue(updated);
      const result = await controller.requestReturn(mockReq, 1);
      expect(result).toEqual(updated);
    });
  });

  // ─── Admin — updateStatus ─────────────────────────────────────────────────

  describe('updateStatus (admin)', () => {
    it('updates order status', async () => {
      const updated = { id: 1, status: 'SHIPPED' };
      mockOrdersService.updateOrderStatus.mockResolvedValue(updated);
      const result = await controller.updateStatus(1, { status: 'SHIPPED' });
      expect(result).toEqual(updated);
      expect(mockOrdersService.updateOrderStatus).toHaveBeenCalledWith(
        1,
        'SHIPPED',
      );
    });
  });
});
