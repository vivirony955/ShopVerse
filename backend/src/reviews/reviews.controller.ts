import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, Req, ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto, UpdateReviewDto } from './dto/review.dto';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('product/:productId')
  getProductReviews(
    @Param('productId', ParseIntPipe) productId: number,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.reviewsService.getProductReviews(productId, Number(page), Number(limit));
  }

  @UseGuards(JwtAuthGuard)
  @Post('product/:productId')
  createReview(
    @Req() req: any,
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.createReview(req.user.id, productId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  updateReview(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewsService.updateReview(req.user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  deleteReview(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const isAdmin = req.user.role === Role.ADMIN;
    return this.reviewsService.deleteReview(req.user.id, id, isAdmin);
  }

  // F1-09: Vote on review helpfulness (POST /reviews/:id/vote { isHelpful: boolean })
  @UseGuards(JwtAuthGuard)
  @Post(':id/vote')
  voteReview(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body('isHelpful') isHelpful: boolean,
  ) {
    return this.reviewsService.voteReview(req.user.id, id, isHelpful);
  }
}
