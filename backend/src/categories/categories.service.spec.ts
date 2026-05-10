// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock, MockPrisma } from '../test-utils/prisma.mock';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(service).toBeDefined());

  // ─── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns root categories with children', async () => {
      const tree = [
        {
          id: 1,
          name: 'Men',
          parentId: null,
          children: [{ id: 3, name: 'Shirts', parentId: 1 }],
        },
        { id: 2, name: 'Women', parentId: null, children: [] },
      ];
      prisma.category.findMany.mockResolvedValue(tree);
      const result = await service.findAll();
      expect(result).toEqual(tree);
      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: { parentId: null },
        include: { children: true },
      });
    });

    it('returns empty array when no categories', async () => {
      prisma.category.findMany.mockResolvedValue([]);
      expect(await service.findAll()).toEqual([]);
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns category with parent and children', async () => {
      const cat = {
        id: 3,
        name: 'Shirts',
        parentId: 1,
        parent: { id: 1, name: 'Men' },
        children: [],
      };
      prisma.category.findUnique.mockResolvedValue(cat);
      const result = await service.findOne(3);
      expect(result).toEqual(cat);
      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: { id: 3 },
        include: { children: true, parent: true },
      });
    });

    it('throws NotFoundException for unknown category', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a root category', async () => {
      const created = { id: 1, name: 'Kids', slug: 'kids', parentId: null };
      prisma.category.create.mockResolvedValue(created);
      const result = await service.create({ name: 'Kids', slug: 'kids' });
      expect(result).toEqual(created);
    });

    it('creates a child category with parentId', async () => {
      const created = {
        id: 4,
        name: 'T-Shirts',
        slug: 't-shirts',
        parentId: 1,
      };
      prisma.category.create.mockResolvedValue(created);
      const result = await service.create({
        name: 'T-Shirts',
        slug: 't-shirts',
        parentId: 1,
      });
      expect(result).toEqual(created);
      expect(prisma.category.create).toHaveBeenCalledWith({
        data: { name: 'T-Shirts', slug: 't-shirts', parentId: 1 },
      });
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates and returns category', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 1,
        name: 'Men',
        slug: 'men',
      });
      prisma.category.update.mockResolvedValue({
        id: 1,
        name: 'Mens',
        slug: 'mens',
      });
      const result = await service.update(1, { name: 'Mens', slug: 'mens' });
      expect(result.name).toBe('Mens');
      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { name: 'Mens', slug: 'mens' },
      });
    });

    it('throws NotFoundException for missing category', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      await expect(service.update(999, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.category.update).not.toHaveBeenCalled();
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes and returns category', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: 1 });
      prisma.category.delete.mockResolvedValue({ id: 1 });
      const result = await service.remove(1);
      expect(result).toEqual({ id: 1 });
    });

    it('throws NotFoundException for missing category', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      expect(prisma.category.delete).not.toHaveBeenCalled();
    });
  });
});
