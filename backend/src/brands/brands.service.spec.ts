// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { BrandsService } from './brands.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock, MockPrisma } from '../test-utils/prisma.mock';

describe('BrandsService', () => {
  let service: BrandsService;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [BrandsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<BrandsService>(BrandsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(service).toBeDefined());

  // ─── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all brands', async () => {
      const brands = [
        { id: 1, name: 'Nike', slug: 'nike' },
        { id: 2, name: 'Adidas', slug: 'adidas' },
      ];
      prisma.brand.findMany.mockResolvedValue(brands);
      expect(await service.findAll()).toEqual(brands);
      expect(prisma.brand.findMany).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when no brands', async () => {
      prisma.brand.findMany.mockResolvedValue([]);
      expect(await service.findAll()).toEqual([]);
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns brand by id', async () => {
      const brand = { id: 1, name: 'Nike', slug: 'nike' };
      prisma.brand.findUnique.mockResolvedValue(brand);
      expect(await service.findOne(1)).toEqual(brand);
      expect(prisma.brand.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('throws NotFoundException for unknown brand', async () => {
      prisma.brand.findUnique.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates and returns a brand', async () => {
      const created = { id: 3, name: 'Puma', slug: 'puma', logoUrl: null };
      prisma.brand.create.mockResolvedValue(created);
      const result = await service.create({ name: 'Puma', slug: 'puma' });
      expect(result).toEqual(created);
      expect(prisma.brand.create).toHaveBeenCalledWith({
        data: { name: 'Puma', slug: 'puma' },
      });
    });

    it('creates a brand with logoUrl', async () => {
      const created = {
        id: 4,
        name: 'Reebok',
        slug: 'reebok',
        logoUrl: 'https://cdn.test/reebok.png',
      };
      prisma.brand.create.mockResolvedValue(created);
      const result = await service.create({
        name: 'Reebok',
        slug: 'reebok',
        logoUrl: 'https://cdn.test/reebok.png',
      });
      expect(result.logoUrl).toBe('https://cdn.test/reebok.png');
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates and returns brand', async () => {
      prisma.brand.findUnique.mockResolvedValue({
        id: 1,
        name: 'Nike',
        slug: 'nike',
      });
      prisma.brand.update.mockResolvedValue({
        id: 1,
        name: 'Nike Inc',
        slug: 'nike',
      });
      const result = await service.update(1, { name: 'Nike Inc' });
      expect(result.name).toBe('Nike Inc');
      expect(prisma.brand.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { name: 'Nike Inc' },
      });
    });

    it('throws NotFoundException for unknown brand', async () => {
      prisma.brand.findUnique.mockResolvedValue(null);
      await expect(service.update(999, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.brand.update).not.toHaveBeenCalled();
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes and returns brand', async () => {
      prisma.brand.findUnique.mockResolvedValue({ id: 1 });
      prisma.brand.delete.mockResolvedValue({ id: 1 });
      expect(await service.remove(1)).toEqual({ id: 1 });
      expect(prisma.brand.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('throws NotFoundException for unknown brand', async () => {
      prisma.brand.findUnique.mockResolvedValue(null);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      expect(prisma.brand.delete).not.toHaveBeenCalled();
    });
  });
});
