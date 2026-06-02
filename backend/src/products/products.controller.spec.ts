// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

describe('ProductsController', () => {
  let controller: ProductsController;

  const mockProductsService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    addVariant: jest.fn(),
    updateVariant: jest.fn(),
    deleteVariant: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: mockProductsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated product list', async () => {
      const response = {
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      };
      mockProductsService.findAll.mockResolvedValue(response);
      const result = await controller.findAll();
      expect(result).toEqual(response);
      expect(mockProductsService.findAll).toHaveBeenCalledTimes(1);
    });

    it('passes filters to service', async () => {
      mockProductsService.findAll.mockResolvedValue({ items: [] });
      await controller.findAll('shirt', 'men', 'nike', 500, 2000, 'M', 'Blue');
      expect(mockProductsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'shirt',
          category: 'men',
          brand: 'nike',
        }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns a single product by id', async () => {
      const product = { id: 1, name: 'Polo Shirt', variants: [] };
      mockProductsService.findOne.mockResolvedValue(product);
      const result = await controller.findOne(1);
      expect(result).toEqual(product);
      expect(mockProductsService.findOne).toHaveBeenCalledWith(1);
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates and returns a new product', async () => {
      const dto = {
        name: 'T-Shirt',
        slug: 't-shirt',
        description: 'Cotton',
        brandId: 1,
        categoryId: 2,
        basePrice: 999,
        images: ['img.jpg'],
      };
      const created = { id: 3, ...dto };
      mockProductsService.create.mockResolvedValue(created);
      const result = await controller.create(dto);
      expect(result).toEqual(created);
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes a product by id', async () => {
      mockProductsService.remove.mockResolvedValue({ id: 1 });
      const result = await controller.remove(1);
      expect(result).toEqual({ id: 1 });
      expect(mockProductsService.remove).toHaveBeenCalledWith(1);
    });
  });

  // ─── Variants ─────────────────────────────────────────────────────────────

  describe('addVariant', () => {
    it('adds a variant to a product', async () => {
      const variant = {
        id: 10,
        productId: 1,
        size: 'L',
        color: 'Red',
        stock: 50,
        sku: 'SKU001',
      };
      mockProductsService.addVariant.mockResolvedValue(variant);
      const result = await controller.addVariant(1, {
        size: 'L',
        color: 'Red',
        stock: 50,
        sku: 'SKU001',
      });
      expect(result).toEqual(variant);
    });
  });
});
