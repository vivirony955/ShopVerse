// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis.service';
import { createPrismaMock, MockPrisma } from '../test-utils/prisma.mock';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: MockPrisma;

  // W4 + P-16: RedisService is no-op in tests. getOrLoad bypasses cache and
  // invokes the loader directly (equivalent to all-misses mode).
  const mockRedis = {
    isEnabled: jest.fn().mockReturnValue(false),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    delByPattern: jest.fn().mockResolvedValue(undefined),
    getOrLoad: jest
      .fn()
      .mockImplementation(
        async (_key: string, _ttl: number, loader: () => Promise<unknown>) =>
          loader(),
      ),
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(service).toBeDefined());

  // ─── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    const mockItems = [
      {
        id: 1,
        name: 'Polo Shirt',
        basePrice: 999,
        brand: { id: 1, name: 'Nike' },
        variants: [],
      },
    ];

    it('returns paginated result with defaults', async () => {
      prisma.product.findMany.mockResolvedValue(mockItems);
      prisma.product.count.mockResolvedValue(1);

      const result = await service.findAll({});
      expect(result).toEqual({
        items: mockItems,
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('applies search filter', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll({ search: 'shirt' });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const whereArg = prisma.product.findMany.mock.calls[0][0].where;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(whereArg.OR).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(whereArg.OR[0]).toMatchObject({ name: { contains: 'shirt' } });
    });

    it('applies category filter', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll({ category: 'men' });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const whereArg = prisma.product.findMany.mock.calls[0][0].where;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(whereArg.category).toEqual({ slug: 'men' });
    });

    it('applies brand filter', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll({ brand: 'nike' });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const whereArg = prisma.product.findMany.mock.calls[0][0].where;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(whereArg.brand).toEqual({ slug: 'nike' });
    });

    it('applies minPrice and maxPrice filter', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll({ minPrice: 500, maxPrice: 2000 });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const whereArg = prisma.product.findMany.mock.calls[0][0].where;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(whereArg.basePrice).toEqual({ gte: 500, lte: 2000 });
    });

    it('applies size and color filter via variants', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll({ size: 'M', color: 'Blue' });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const whereArg = prisma.product.findMany.mock.calls[0][0].where;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(whereArg.variants.some).toMatchObject({
        size: 'M',
        color: 'Blue',
        stock: { gt: 0 },
      });
    });

    it('applies tags filter', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll({ tags: 'summer,cotton' });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const whereArg = prisma.product.findMany.mock.calls[0][0].where;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(whereArg.tags).toEqual({ hasSome: ['summer', 'cotton'] });
    });

    it('calculates totalPages correctly', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(45);
      const result = await service.findAll({ limit: 10 });
      expect(result.totalPages).toBe(5);
    });

    it('respects page and limit', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(100);
      await service.findAll({ page: 3, limit: 10 });
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns product with relations', async () => {
      const product = {
        id: 1,
        name: 'Polo',
        brand: {},
        category: {},
        variants: [],
        reviews: [],
      };
      prisma.product.findUnique.mockResolvedValue(product);
      const result = await service.findOne(1);
      expect(result).toEqual(product);
      expect(prisma.product.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } }),
      );
    });

    it('throws NotFoundException for unknown product', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates and returns product with relations', async () => {
      const dto = {
        name: 'T-Shirt',
        slug: 't-shirt',
        description: 'Cotton tee',
        brandId: 1,
        categoryId: 2,
        basePrice: 799,
        images: ['img.jpg'],
      };
      const created = {
        id: 5,
        ...dto,
        tags: [],
        brand: { id: 1, name: 'Nike' },
        category: {},
      };
      prisma.product.create.mockResolvedValue(created);
      const result = await service.create(dto);
      expect(result).toEqual(created);
    });

    it('defaults tags to empty array when not provided', async () => {
      const dto = {
        name: 'T-Shirt',
        slug: 't-shirt',
        description: 'Cotton',
        brandId: 1,
        categoryId: 2,
        basePrice: 799,
        images: [],
      };
      prisma.product.create.mockResolvedValue({ id: 1, ...dto, tags: [] });
      await service.create(dto);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const dataArg = prisma.product.create.mock.calls[0][0].data;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(dataArg.tags).toEqual([]);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates and returns product', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 1, name: 'Old' });
      prisma.product.update.mockResolvedValue({
        id: 1,
        name: 'New',
        brand: {},
        category: {},
      });
      const result = await service.update(1, { name: 'New' });
      expect(result.name).toBe('New');
    });

    it('throws NotFoundException for unknown product', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.update(999, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes and returns product', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 1 });
      prisma.product.delete.mockResolvedValue({ id: 1 });
      expect(await service.remove(1)).toEqual({ id: 1 });
    });

    it('throws NotFoundException for unknown product', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Variants ────────────────────────────────────────────────────────────────

  describe('addVariant', () => {
    it('creates a variant for a product', async () => {
      const variant = {
        id: 10,
        productId: 1,
        size: 'L',
        color: 'Red',
        stock: 50,
        sku: 'SKU-001',
      };
      prisma.variant.create.mockResolvedValue(variant);
      const result = await service.addVariant(1, {
        size: 'L',
        color: 'Red',
        stock: 50,
        sku: 'SKU-001',
      });
      expect(result).toEqual(variant);
      expect(prisma.variant.create).toHaveBeenCalledWith({
        data: {
          size: 'L',
          color: 'Red',
          stock: 50,
          sku: 'SKU-001',
          productId: 1,
        },
      });
    });
  });

  describe('updateVariant', () => {
    it('updates a variant', async () => {
      prisma.variant.findFirst.mockResolvedValue({
        id: 10,
        productId: 1,
        stock: 50,
      });
      prisma.variant.update.mockResolvedValue({ id: 10, stock: 30 });
      const result = await service.updateVariant(1, 10, { stock: 30 });
      expect(result.stock).toBe(30);
    });

    it('throws NotFoundException when variant not in product', async () => {
      prisma.variant.findFirst.mockResolvedValue(null);
      await expect(service.updateVariant(1, 99, { stock: 5 })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteVariant', () => {
    it('deletes a variant', async () => {
      prisma.variant.findFirst.mockResolvedValue({ id: 10, productId: 1 });
      prisma.variant.delete.mockResolvedValue({ id: 10 });
      expect(await service.deleteVariant(1, 10)).toEqual({ id: 10 });
    });

    it('throws NotFoundException when variant not in product', async () => {
      prisma.variant.findFirst.mockResolvedValue(null);
      await expect(service.deleteVariant(1, 99)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
