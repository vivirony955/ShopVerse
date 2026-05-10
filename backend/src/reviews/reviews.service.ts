// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async getProductReviews(productId: number, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [reviews, total, agg] = await Promise.all([
      this.prisma.review.findMany({
        where: { productId },
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.review.count({ where: { productId } }),
      this.prisma.review.aggregate({ where: { productId }, _avg: { rating: true } }),
    ]);
    return { reviews, total, page, limit, avgRating: agg._avg.rating ?? 0 };
  }

  /**
   * B-14 PERF: write-through rating cache. Recomputes Product.avgRating and
   * Product.reviewCount from the Review table inside the same transaction
   * as the mutation, so the cache is always consistent (new invariant:
   * Product.avgRating == AVG(Review.rating), Product.reviewCount == COUNT(Review)).
   */
  private async refreshProductRatingCache(
    tx: Prisma.TransactionClient,
    productId: number,
  ): Promise<void> {
    const agg = await tx.review.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await tx.product.update({
      where: { id: productId },
      data: {
        avgRating: agg._avg.rating ?? 0,
        reviewCount: agg._count._all,
      },
    });
  }

  async createReview(
    userId: number,
    productId: number,
    data: { rating: number; title?: string; body?: string },
  ) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    // F1-08: Check if user has a delivered order containing this product
    const purchaseCount = await this.prisma.orderItem.count({
      where: {
        order: { userId, status: 'DELIVERED' },
        variant: { productId },
      },
    });
    const isVerifiedPurchase = purchaseCount > 0;

    return this.prisma.$transaction(async (tx) => {
      const review = await tx.review.create({
        data: { userId, productId, isVerifiedPurchase, ...data },
      }).catch((e) => {
        if (e?.code === 'P2002') throw new ConflictException('You have already reviewed this product');
        throw e;
      });
      await this.refreshProductRatingCache(tx, productId);
      return review;
    });
  }

  async updateReview(
    userId: number,
    reviewId: number,
    data: { rating?: number; title?: string; body?: string },
  ) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    if (review.userId !== userId) throw new ForbiddenException();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.review.update({ where: { id: reviewId }, data });
      // Only refresh cache if rating changed — title/body edits don't affect avg.
      if (data.rating !== undefined && data.rating !== review.rating) {
        await this.refreshProductRatingCache(tx, review.productId);
      }
      return updated;
    });
  }

  /**
   * F1-09: Vote on a review (helpful/not helpful).
   * Upserts so a user can change their vote. Updates helpfulCount atomically.
   */
  async voteReview(userId: number, reviewId: number, isHelpful: boolean) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    if (review.userId === userId) throw new BadRequestException('Cannot vote on your own review');

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.reviewVote.findUnique({ where: { reviewId_userId: { reviewId, userId } } });

      if (existing) {
        if (existing.isHelpful === isHelpful) {
          // Remove vote (toggle off)
          await tx.reviewVote.delete({ where: { reviewId_userId: { reviewId, userId } } });
          if (isHelpful) await tx.review.update({ where: { id: reviewId }, data: { helpfulCount: { decrement: 1 } } });
        } else {
          // Flip vote
          await tx.reviewVote.update({ where: { reviewId_userId: { reviewId, userId } }, data: { isHelpful } });
          await tx.review.update({
            where: { id: reviewId },
            data: { helpfulCount: isHelpful ? { increment: 1 } : { decrement: 1 } },
          });
        }
      } else {
        // New vote
        await tx.reviewVote.create({ data: { reviewId, userId, isHelpful } });
        if (isHelpful) await tx.review.update({ where: { id: reviewId }, data: { helpfulCount: { increment: 1 } } });
      }

      return tx.review.findUnique({ where: { id: reviewId }, select: { id: true, helpfulCount: true } });
    });
  }

  async deleteReview(userId: number, reviewId: number, isAdmin = false) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    if (!isAdmin && review.userId !== userId) throw new ForbiddenException();
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.review.delete({ where: { id: reviewId } });
      await this.refreshProductRatingCache(tx, review.productId);
      return deleted;
    });
  }
}
