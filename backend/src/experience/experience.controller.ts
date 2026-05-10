import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ExperienceService } from './experience.service';
import { AddGiftOptionDto, CreateDeliverySlotDto, SaveForLaterDto } from './dto/experience.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Role, Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('experience')
@UseGuards(JwtAuthGuard)
export class ExperienceController {
  constructor(private readonly svc: ExperienceService) {}

  // Save for later
  @Post('saved')
  save(@CurrentUser() user: any, @Body() dto: SaveForLaterDto) {
    return this.svc.saveForLater(user.id, dto);
  }

  @Get('saved')
  getSaved(@CurrentUser() user: any) {
    return this.svc.getSavedForLater(user.id);
  }

  @Delete('saved/:variantId')
  removeSaved(@CurrentUser() user: any, @Param('variantId', ParseIntPipe) variantId: number) {
    return this.svc.removeSavedForLater(user.id, variantId);
  }

  @Post('saved/:variantId/move-to-cart')
  moveToCart(@CurrentUser() user: any, @Param('variantId', ParseIntPipe) variantId: number) {
    return this.svc.moveToCart(user.id, variantId);
  }

  // Recently purchased
  @Get('recently-purchased')
  recentlyPurchased(@CurrentUser() user: any) {
    return this.svc.recentlyPurchased(user.id);
  }

  // Delivery slots
  @Get('slots')
  slots(@Query('date') date: string, @Query('pincode') pincode?: string) {
    return this.svc.getAvailableSlots(date, pincode);
  }

  @Post('slots/:id/book')
  bookSlot(@Param('id', ParseIntPipe) id: number) {
    return this.svc.bookSlot(id);
  }

  // Gift options
  @Post('gift')
  addGift(@Body() dto: AddGiftOptionDto) {
    return this.svc.addGiftOption(dto);
  }

  @Get('gift/:orderId')
  getGift(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.svc.getGiftOption(orderId);
  }

  // Admin: create slots
  @Post('slots')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  createSlot(@Body() dto: CreateDeliverySlotDto) {
    return this.svc.createSlot(dto);
  }

  // F1-04: Recently viewed
  @Post('recently-viewed/:productId')
  trackView(@CurrentUser() user: any, @Param('productId', ParseIntPipe) productId: number) {
    return this.svc.trackRecentlyViewed(user.id, productId);
  }

  @Get('recently-viewed')
  getRecentlyViewed(@CurrentUser() user: any) {
    return this.svc.getRecentlyViewed(user.id);
  }

  // F2-13: Delivery rating
  @Post('delivery-rating/:orderId')
  rateDelivery(
    @CurrentUser() user: any,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: { rating: number; comment?: string },
  ) {
    return this.svc.rateDelivery(user.id, orderId, dto.rating, dto.comment);
  }

  @Get('delivery-rating/:orderId')
  getDeliveryRating(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.svc.getDeliveryRating(orderId);
  }
}
