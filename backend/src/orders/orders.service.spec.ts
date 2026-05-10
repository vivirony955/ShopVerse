import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { CouponsService } from '../coupons/coupons.service';
import { EmailService } from '../email/email.service';
import { FraudService } from '../fraud/fraud.service';
import { CartReservationService } from '../cart/cart-reservation.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { ReferralService } from '../referral/referral.service';
import { InventoryService } from '../inventory/inventory.service';
import { AbandonedCartService } from '../abandoned-cart/abandoned-cart.service';
import { WalletService } from '../wallet/wallet.service';
import { createPrismaMock, MockPrisma } from '../test-utils/prisma.mock';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: MockPrisma;

  const mockCouponsService = {
    applyDiscount: jest.fn(),
    validateCoupon: jest.fn(),
  };
  const mockEmailService = {
    sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
    sendOrderShipped: jest.fn().mockResolvedValue(undefined),
    sendOrderDelivered: jest.fn().mockResolvedValue(undefined),
  };
  const mockFraudService = { preOrderFraudCheck: jest.fn().mockResolvedValue({ blocked: false }), preGuestFraudCheck: jest.fn().mockResolvedValue({ blocked: false }) };
  const mockCartReservation = { validateForCheckout: jest.fn(), consume: jest.fn() };
  const mockLoyaltyService = { earnOnDelivery: jest.fn(), redeemPoints: jest.fn() };
  const mockReferralService = { rewardOnFirstOrder: jest.fn() };
  const mockInventoryService = { reserve: jest.fn(), release: jest.fn() };
  const mockAbandonedCartService = { clearSnapshot: jest.fn(), clearForUser: jest.fn().mockResolvedValue(undefined) };
  const mockWalletService = { debit: jest.fn().mockResolvedValue(undefined), getBalance: jest.fn().mockResolvedValue(0) };

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: CouponsService, useValue: mockCouponsService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: FraudService, useValue: mockFraudService },
        { provide: CartReservationService, useValue: mockCartReservation },
        { provide: LoyaltyService, useValue: mockLoyaltyService },
        { provide: ReferralService, useValue: mockReferralService },
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: AbandonedCartService, useValue: mockAbandonedCartService },
        { provide: WalletService, useValue: mockWalletService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(service).toBeDefined());

  // ─── placeOrder ──────────────────────────────────────────────────────────────

  describe('placeOrder', () => {
    const mockReservation = {
      id: 1,
      userId: 1,
      status: 'ACTIVE',
      items: [{ variantId: 5, quantity: 2, lockedPrice: 1000 }],
    };
    const address = { id: 2, userId: 1, fullName: 'Jane', city: 'Delhi', state: 'DL', pincode: '110001' };

    beforeEach(() => {
      mockCartReservation.validateForCheckout.mockResolvedValue({ valid: true, reservation: mockReservation });
      mockCartReservation.consume.mockResolvedValue(undefined);
    });

    it('places an order atomically and returns it', async () => {
      prisma.address.findFirst.mockResolvedValue(address);
      const createdOrder = { id: 10, subtotal: 2000, total: 2000, status: 'PENDING', items: [], user: {} };
      prisma.$transaction.mockImplementation((cb: any) => cb(prisma));
      prisma.order.create.mockResolvedValue(createdOrder);
      prisma.cartItem.deleteMany.mockResolvedValue({ count: 1 });
      prisma.trackingEvent.create.mockResolvedValue({});

      const result = await service.placeOrder(1, { addressId: 2, reservationId: 1 });
      expect(result).toEqual(createdOrder);
    });

    it('applies coupon and increments usedCount in transaction', async () => {
      prisma.address.findFirst.mockResolvedValue(address);
      mockCouponsService.applyDiscount.mockResolvedValue(200);

      prisma.$transaction.mockImplementation((cb: any) => cb(prisma));
      prisma.order.create.mockResolvedValue({ id: 11, total: 1800, discountAmount: 200, items: [], user: {} });
      prisma.cartItem.deleteMany.mockResolvedValue({ count: 1 });
      prisma.$executeRaw.mockResolvedValue(1);
      prisma.coupon.findUnique.mockResolvedValue({ id: 5 });
      prisma.couponUsage.create.mockResolvedValue({});
      prisma.trackingEvent.create.mockResolvedValue({});

      await service.placeOrder(1, { addressId: 2, reservationId: 1, couponCode: 'SAVE20' });
      expect(mockCouponsService.applyDiscount).toHaveBeenCalledWith('SAVE20', 2000, 1);
    });

    it('throws BadRequestException when reservation is invalid', async () => {
      mockCartReservation.validateForCheckout.mockResolvedValue({ valid: false, reason: 'Expired' });
      await expect(service.placeOrder(1, { addressId: 2, reservationId: 1 })).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when reservationId is missing', async () => {
      await expect(service.placeOrder(1, { addressId: 2, reservationId: 0 })).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when address not owned by user', async () => {
      prisma.address.findFirst.mockResolvedValue(null);
      await expect(service.placeOrder(1, { addressId: 99, reservationId: 1 })).rejects.toThrow(NotFoundException);
    });

    it('blocks order when fraud check returns blocked', async () => {
      mockFraudService.preOrderFraudCheck.mockResolvedValueOnce({ blocked: true, reason: 'Blocked IP' });
      await expect(service.placeOrder(1, { addressId: 2, reservationId: 1 })).rejects.toThrow(BadRequestException);
    });
  });

  // ─── getUserOrders ────────────────────────────────────────────────────────────

  describe('getUserOrders', () => {
    it('returns all orders for a user', async () => {
      const orders = [{ id: 1, status: 'PENDING' }, { id: 2, status: 'DELIVERED' }];
      prisma.order.findMany.mockResolvedValue(orders);
      const result = await service.getUserOrders(1);
      expect(result).toEqual(orders);
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 1 } }),
      );
    });
  });

  // ─── getOrderById ─────────────────────────────────────────────────────────────

  describe('getOrderById', () => {
    it('returns order when user is the owner', async () => {
      const order = { id: 1, userId: 1, status: 'PENDING', items: [], user: {} };
      prisma.order.findUnique.mockResolvedValue(order);
      const result = await service.getOrderById(1, 1);
      expect(result).toEqual(order);
    });

    it('returns order when caller is admin', async () => {
      const order = { id: 1, userId: 2, status: 'PENDING', items: [], user: {} };
      prisma.order.findUnique.mockResolvedValue(order);
      const result = await service.getOrderById(1, 1, true);
      expect(result).toEqual(order);
    });

    it('throws ForbiddenException when user does not own order', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 1, userId: 99, items: [], user: {} });
      await expect(service.getOrderById(1, 1)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(service.getOrderById(1, 999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── cancelOrder ─────────────────────────────────────────────────────────────

  describe('cancelOrder', () => {
    it('cancels a PENDING order and calls inventory release', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, userId: 1, status: 'PENDING' });
      prisma.orderItem.findMany.mockResolvedValue([{ variantId: 5, quantity: 2, cancelledAt: null }]);
      prisma.order.update.mockResolvedValue({ id: 1, status: 'CANCELLED' });
      mockInventoryService.release.mockResolvedValue(undefined);

      const result = await service.cancelOrder(1, 1);
      expect(result).toEqual({ message: 'Order cancelled successfully' });
      expect(mockInventoryService.release).toHaveBeenCalled();
    });

    it('cancels a CONFIRMED order', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, userId: 1, status: 'CONFIRMED' });
      prisma.orderItem.findMany.mockResolvedValue([]);
      prisma.order.update.mockResolvedValue({ id: 1, status: 'CANCELLED' });

      const result = await service.cancelOrder(1, 1);
      expect(result).toEqual({ message: 'Order cancelled successfully' });
    });

    it('throws NotFoundException when order not found', async () => {
      prisma.order.findFirst.mockResolvedValue(null);
      await expect(service.cancelOrder(1, 999)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when order is SHIPPED', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, userId: 1, status: 'SHIPPED' });
      await expect(service.cancelOrder(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when order is DELIVERED', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, userId: 1, status: 'DELIVERED' });
      await expect(service.cancelOrder(1, 1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── requestReturn ────────────────────────────────────────────────────────────

  describe('requestReturn', () => {
    const deliveredOrder = {
      id: 1, userId: 1, status: 'DELIVERED', returnRequest: null, updatedAt: new Date(),
      items: [{ cancelledAt: null, variant: { product: { category: { returnWindowDays: 7 } } } }],
      trackingEvents: [{ createdAt: new Date() }],
    };

    it('creates a return request for DELIVERED order', async () => {
      prisma.order.findFirst.mockResolvedValue(deliveredOrder);
      prisma.returnRequest.create.mockResolvedValue({ id: 1, status: 'PENDING', orderId: 1 });
      prisma.order.update.mockResolvedValue({ id: 1, status: 'RETURN_REQUESTED' });
      const result = await service.requestReturn(1, 1);
      expect(prisma.returnRequest.create).toHaveBeenCalled();
    });

    it('throws NotFoundException when order not found', async () => {
      prisma.order.findFirst.mockResolvedValue(null);
      await expect(service.requestReturn(1, 999)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when order is not DELIVERED', async () => {
      prisma.order.findFirst.mockResolvedValue({ ...deliveredOrder, status: 'PENDING' });
      await expect(service.requestReturn(1, 1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Admin ───────────────────────────────────────────────────────────────────

  describe('getAllOrders', () => {
    it('returns all orders with pagination defaults', async () => {
      const orders = [{ id: 1 }, { id: 2 }];
      prisma.order.findMany.mockResolvedValue(orders);
      const result = await service.getAllOrders({});
      expect(result).toEqual(orders);
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('filters by status', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      await service.getAllOrders({ status: 'SHIPPED' });
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'SHIPPED' } }),
      );
    });

    it('respects custom page and limit', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      await service.getAllOrders({ page: 2, limit: 5 });
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });
  });

  describe('updateOrderStatus', () => {
    it('updates order status', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 1, status: 'PENDING', items: [] });
      prisma.order.update.mockResolvedValue({ id: 1, status: 'SHIPPED' });
      const result = await service.updateOrderStatus(1, 'SHIPPED');
      expect(result.status).toBe('SHIPPED');
    });

    it('throws NotFoundException for unknown order', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(service.updateOrderStatus(999, 'SHIPPED')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updatePaymentStatus', () => {
    it('updates payment fields on order', async () => {
      prisma.order.update.mockResolvedValue({ id: 1, paymentId: 'pi_test', paymentStatus: 'PAID' });
      const result = await service.updatePaymentStatus(1, 'pi_test', 'PAID');
      expect(result.paymentStatus).toBe('PAID');
    });
  });
});
