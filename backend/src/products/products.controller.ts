// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, ParseIntPipe,
  UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto, CreateVariantDto, UpdateVariantDto } from './dto/create-product.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('brand') brand?: string,
    @Query('minPrice') minPrice?: number,
    @Query('maxPrice') maxPrice?: number,
    @Query('size') size?: string,
    @Query('color') color?: string,
    @Query('tags') tags?: string,
    @Query('sort') sort?: string,
    @Query('order') order: 'asc' | 'desc' = 'asc',
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.productsService.findAll({
      search, category, brand, minPrice, maxPrice,
      size, color, tags, sort, order, page, limit,
    });
  }

  @Get('autocomplete')
  autocomplete(@Query('q') q: string) {
    return this.productsService.autocomplete(q ?? '');
  }

  // F2-11: Trending searches
  @Get('trending-searches')
  getTrendingSearches(@Query('limit') limit?: number) {
    return this.productsService.getTrendingSearches(limit ? Number(limit) : 10);
  }

  // F2-19: Loyalty tiers
  @Get('loyalty-tiers')
  getLoyaltyTiers() {
    return this.productsService.getLoyaltyTiers();
  }

  @Post('loyalty-tiers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  upsertLoyaltyTier(@Body() dto: { name: string; minPoints: number; earnMultiplier: number; perks: string[] }) {
    return this.productsService.upsertLoyaltyTier(dto);
  }

  // F1-03: Faceted filter counts — mirrors findAll query params
  @Get('facets')
  getFacets(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('brand') brand?: string,
    @Query('minPrice') minPrice?: number,
    @Query('maxPrice') maxPrice?: number,
    @Query('size') size?: string,
    @Query('color') color?: string,
    @Query('tags') tags?: string,
  ) {
    return this.productsService.getFacets({ search, category, brand, minPrice, maxPrice, size, color, tags });
  }

  // F1-20: Bulk product upload via CSV (multipart/form-data, field name: "file")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('bulk-upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async bulkUpload(@UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string }) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!file.mimetype.includes('csv') && !file.originalname.endsWith('.csv')) {
      throw new BadRequestException('Only CSV files are accepted');
    }
    const csvText = file.buffer.toString('utf-8');
    return this.productsService.bulkUpload(csvText);
  }

  // F1-06: Size chart by category (fetched on PDP via product's categoryId)
  @Get('size-chart/:categoryId')
  getSizeChart(@Param('categoryId', ParseIntPipe) categoryId: number) {
    return this.productsService.getSizeChart(categoryId);
  }

  @Get(':id/related')
  getRelated(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit = 8,
  ) {
    return this.productsService.getRelated(id, Number(limit));
  }

  @Get(':id/frequently-bought-together')
  getFrequentlyBoughtTogether(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit = 4,
  ) {
    return this.productsService.getFrequentlyBoughtTogether(id, Number(limit));
  }

  @Get(':id/upsells')
  getUpsells(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit = 4,
  ) {
    return this.productsService.getUpsells(id, Number(limit));
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.remove(id);
  }

  // ─── Variants ───────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post(':id/variants')
  addVariant(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateVariantDto) {
    return this.productsService.addVariant(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/variants/:variantId')
  updateVariant(
    @Param('id', ParseIntPipe) id: number,
    @Param('variantId', ParseIntPipe) variantId: number,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.productsService.updateVariant(id, variantId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id/variants/:variantId')
  deleteVariant(
    @Param('id', ParseIntPipe) id: number,
    @Param('variantId', ParseIntPipe) variantId: number,
  ) {
    return this.productsService.deleteVariant(id, variantId);
  }

  // ─── Notify back-in-stock (FINAL §3.2) ─────────────────────────────────────
  @Post(':id/variants/:variantId/notify-stock')
  notifyBackInStock(
    @Param('variantId', ParseIntPipe) variantId: number,
    @Body() body: { email: string; phone?: string },
  ) {
    return this.productsService.subscribeStockNotification(variantId, body.email, body.phone);
  }
}
