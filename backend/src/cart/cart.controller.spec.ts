import { Test, TestingModule } from '@nestjs/testing';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartReservationService } from './cart-reservation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

describe('CartController', () => {
  let controller: CartController;

  const mockCartService = {
    getCart: jest.fn(),
    addItem: jest.fn(),
    updateItem: jest.fn(),
    removeItem: jest.fn(),
    clearCart: jest.fn(),
  };

  const mockReq = { user: { id: 1 } };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CartController],
      providers: [
        { provide: CartService, useValue: mockCartService },
        { provide: CartReservationService, useValue: { createReservation: jest.fn(), validateForCheckout: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CartController>(CartController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── getCart ──────────────────────────────────────────────────────────────

  describe('getCart', () => {
    it('returns the cart for the current user', async () => {
      const cart = { id: 1, userId: 1, items: [] };
      mockCartService.getCart.mockResolvedValue(cart);
      const result = await controller.getCart(mockReq);
      expect(result).toEqual(cart);
      expect(mockCartService.getCart).toHaveBeenCalledWith(1);
    });
  });

  // ─── addItem ──────────────────────────────────────────────────────────────

  describe('addItem', () => {
    it('adds an item and returns the cart item', async () => {
      const item = { id: 5, cartId: 1, variantId: 2, quantity: 2 };
      mockCartService.addItem.mockResolvedValue(item);
      const result = await controller.addItem(mockReq, { variantId: 2, quantity: 2 });
      expect(result).toEqual(item);
      expect(mockCartService.addItem).toHaveBeenCalledWith(1, 2, 2);
    });
  });

  // ─── updateItem ───────────────────────────────────────────────────────────

  describe('updateItem', () => {
    it('updates item quantity', async () => {
      const updated = { id: 5, quantity: 3 };
      mockCartService.updateItem.mockResolvedValue(updated);
      const result = await controller.updateItem(mockReq, 5, { quantity: 3 });
      expect(result).toEqual(updated);
      expect(mockCartService.updateItem).toHaveBeenCalledWith(1, 5, 3);
    });
  });

  // ─── removeItem ───────────────────────────────────────────────────────────

  describe('removeItem', () => {
    it('removes an item from the cart', async () => {
      mockCartService.removeItem.mockResolvedValue({ id: 5 });
      const result = await controller.removeItem(mockReq, 5);
      expect(result).toEqual({ id: 5 });
      expect(mockCartService.removeItem).toHaveBeenCalledWith(1, 5);
    });
  });

  // ─── clearCart ────────────────────────────────────────────────────────────

  describe('clearCart', () => {
    it('clears all items and returns message', async () => {
      mockCartService.clearCart.mockResolvedValue({ message: 'Cart cleared' });
      const result = await controller.clearCart(mockReq);
      expect(result).toEqual({ message: 'Cart cleared' });
      expect(mockCartService.clearCart).toHaveBeenCalledWith(1);
    });
  });
});
