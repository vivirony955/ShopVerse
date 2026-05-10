// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AuthenticatedRequest } from '../common/types';

describe('ReviewsController', () => {
  let controller: ReviewsController;

  const mockReviewsService = {
    getProductReviews: jest.fn(),
    createReview: jest.fn(),
    updateReview: jest.fn(),
    deleteReview: jest.fn(),
  };

  const mockReq = {
    user: { id: 1, role: 'USER' },
  } as unknown as AuthenticatedRequest;
  const adminReq = {
    user: { id: 1, role: 'ADMIN' },
  } as unknown as AuthenticatedRequest;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReviewsController],
      providers: [{ provide: ReviewsService, useValue: mockReviewsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReviewsController>(ReviewsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(controller).toBeDefined());

  describe('getProductReviews', () => {
    it('returns paginated reviews for a product', async () => {
      const response = {
        reviews: [],
        total: 0,
        avgRating: 0,
        page: 1,
        limit: 10,
      };
      mockReviewsService.getProductReviews.mockResolvedValue(response);
      const result = await controller.getProductReviews(10, 1, 10);
      expect(result).toEqual(response);
      expect(mockReviewsService.getProductReviews).toHaveBeenCalledWith(
        10,
        1,
        10,
      );
    });
  });

  describe('createReview', () => {
    it('creates a review for the current user', async () => {
      const review = { id: 1, userId: 1, productId: 5, rating: 5 };
      mockReviewsService.createReview.mockResolvedValue(review);
      const result = await controller.createReview(mockReq, 5, {
        rating: 5,
        body: 'Great!',
      });
      expect(result).toEqual(review);
      expect(mockReviewsService.createReview).toHaveBeenCalledWith(1, 5, {
        rating: 5,
        body: 'Great!',
      });
    });
  });

  describe('updateReview', () => {
    it('updates a review owned by current user', async () => {
      const updated = { id: 1, rating: 4 };
      mockReviewsService.updateReview.mockResolvedValue(updated);
      const result = await controller.updateReview(mockReq, 1, { rating: 4 });
      expect(result).toEqual(updated);
      expect(mockReviewsService.updateReview).toHaveBeenCalledWith(1, 1, {
        rating: 4,
      });
    });
  });

  describe('deleteReview', () => {
    it('deletes a review as owner (isAdmin = false)', async () => {
      mockReviewsService.deleteReview.mockResolvedValue({ id: 1 });
      const result = await controller.deleteReview(mockReq, 1);
      expect(result).toEqual({ id: 1 });
      expect(mockReviewsService.deleteReview).toHaveBeenCalledWith(1, 1, false);
    });

    it('deletes a review as admin (isAdmin = true)', async () => {
      mockReviewsService.deleteReview.mockResolvedValue({ id: 3 });
      await controller.deleteReview(adminReq, 3);
      expect(mockReviewsService.deleteReview).toHaveBeenCalledWith(1, 3, true);
    });
  });
});
