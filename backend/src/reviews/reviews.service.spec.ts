// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock, MockPrisma } from '../test-utils/prisma.mock';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(service).toBeDefined());

  // ─── getProductReviews ────────────────────────────────────────────────────────

  describe('getProductReviews', () => {
    it('returns reviews with total count and average rating', async () => {
      const reviews = [
        { id: 1, rating: 5, body: 'Great!', user: { id: 1, firstName: 'Jane' } },
        { id: 2, rating: 3, body: 'OK', user: { id: 2, firstName: 'Bob' } },
      ];
      prisma.review.findMany.mockResolvedValue(reviews);
      prisma.review.count.mockResolvedValue(2);
      prisma.review.aggregate.mockResolvedValue({ _avg: { rating: 4 } });

      const result = await service.getProductReviews(10, 1, 10);
      expect(result.reviews).toEqual(reviews);
      expect(result.total).toBe(2);
      expect(result.avgRating).toBe(4);
      expect(result.page).toBe(1);
    });

    it('returns avgRating 0 when no reviews exist', async () => {
      prisma.review.findMany.mockResolvedValue([]);
      prisma.review.count.mockResolvedValue(0);
      prisma.review.aggregate.mockResolvedValue({ _avg: { rating: null } });

      const result = await service.getProductReviews(10);
      expect(result.avgRating).toBe(0);
    });

    it('applies pagination', async () => {
      prisma.review.findMany.mockResolvedValue([]);
      prisma.review.count.mockResolvedValue(50);
      prisma.review.aggregate.mockResolvedValue({ _avg: { rating: null } });

      await service.getProductReviews(10, 3, 5);
      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 }),
      );
    });
  });

  // ─── createReview ─────────────────────────────────────────────────────────────

  describe('createReview', () => {
    it('creates a review for an existing product', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 10, name: 'Polo' });
      prisma.review.create.mockResolvedValue({ id: 1, userId: 1, productId: 10, rating: 5 });
      prisma.review.aggregate.mockResolvedValue({ _avg: { rating: 5 }, _count: { _all: 1 } });
      prisma.product.update.mockResolvedValue({});

      const result = await service.createReview(1, 10, { rating: 5, body: 'Excellent!' });
      expect(result).toHaveProperty('rating', 5);
    });

    it('throws NotFoundException for unknown product', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.createReview(1, 999, { rating: 4 })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateReview ─────────────────────────────────────────────────────────────

  describe('updateReview', () => {
    it('allows owner to update their review', async () => {
      prisma.review.findUnique.mockResolvedValue({ id: 1, userId: 1, rating: 3, productId: 10 });
      prisma.review.update.mockResolvedValue({ id: 1, userId: 1, rating: 5, body: 'Updated' });
      prisma.review.aggregate.mockResolvedValue({ _avg: { rating: 5 }, _count: { _all: 1 } });
      prisma.product.update.mockResolvedValue({});

      const result = await service.updateReview(1, 1, { rating: 5, body: 'Updated' });
      expect(result.rating).toBe(5);
      expect(prisma.review.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { rating: 5, body: 'Updated' },
      });
    });

    it('throws ForbiddenException when non-owner tries to update', async () => {
      prisma.review.findUnique.mockResolvedValue({ id: 1, userId: 99, rating: 3 });
      await expect(service.updateReview(1, 1, { rating: 5 })).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException for unknown review', async () => {
      prisma.review.findUnique.mockResolvedValue(null);
      await expect(service.updateReview(1, 999, { rating: 5 })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── deleteReview ─────────────────────────────────────────────────────────────

  describe('deleteReview', () => {
    it('allows owner to delete their review', async () => {
      prisma.review.findUnique.mockResolvedValue({ id: 1, userId: 1, productId: 10 });
      prisma.review.delete.mockResolvedValue({ id: 1 });
      prisma.review.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } });
      prisma.product.update.mockResolvedValue({});

      const result = await service.deleteReview(1, 1);
      expect(result).toEqual({ id: 1 });
    });

    it('allows admin to delete any review', async () => {
      prisma.review.findUnique.mockResolvedValue({ id: 1, userId: 99, productId: 10 });
      prisma.review.delete.mockResolvedValue({ id: 1 });
      prisma.review.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } });
      prisma.product.update.mockResolvedValue({});

      const result = await service.deleteReview(1, 1, true);
      expect(result).toEqual({ id: 1 });
    });

    it('throws ForbiddenException when non-owner, non-admin deletes', async () => {
      prisma.review.findUnique.mockResolvedValue({ id: 1, userId: 99 });
      await expect(service.deleteReview(1, 1, false)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException for unknown review', async () => {
      prisma.review.findUnique.mockResolvedValue(null);
      await expect(service.deleteReview(1, 999)).rejects.toThrow(NotFoundException);
    });
  });
});
