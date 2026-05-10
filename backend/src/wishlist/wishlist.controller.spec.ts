// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Test, TestingModule } from '@nestjs/testing';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types';

describe('WishlistController', () => {
  let controller: WishlistController;

  const mockWishlistService = {
    getWishlist: jest.fn(),
    addToWishlist: jest.fn(),
    removeFromWishlist: jest.fn(),
  };

  const mockReq = { user: { id: 1 } } as unknown as AuthenticatedRequest;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WishlistController],
      providers: [{ provide: WishlistService, useValue: mockWishlistService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WishlistController>(WishlistController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(controller).toBeDefined());

  describe('getWishlist', () => {
    it('returns wishlist for current user', async () => {
      const items = [{ id: 1, productId: 10 }];
      mockWishlistService.getWishlist.mockResolvedValue(items);
      const result = await controller.getWishlist(mockReq);
      expect(result).toEqual(items);
      expect(mockWishlistService.getWishlist).toHaveBeenCalledWith(1);
    });
  });

  describe('addToWishlist', () => {
    it('adds a product to wishlist', async () => {
      const item = { id: 5, userId: 1, productId: 10 };
      mockWishlistService.addToWishlist.mockResolvedValue(item);
      const result = await controller.addToWishlist(mockReq, 10);
      expect(result).toEqual(item);
      expect(mockWishlistService.addToWishlist).toHaveBeenCalledWith(1, 10);
    });
  });

  describe('removeFromWishlist', () => {
    it('removes a product from wishlist', async () => {
      mockWishlistService.removeFromWishlist.mockResolvedValue({ id: 5 });
      const result = await controller.removeFromWishlist(mockReq, 10);
      expect(result).toEqual({ id: 5 });
      expect(mockWishlistService.removeFromWishlist).toHaveBeenCalledWith(
        1,
        10,
      );
    });
  });
});
