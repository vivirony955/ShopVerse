// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Test, TestingModule } from '@nestjs/testing';
import { BrandsController } from './brands.controller';
import { BrandsService } from './brands.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

describe('BrandsController', () => {
  let controller: BrandsController;

  const mockBrandsService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BrandsController],
      providers: [{ provide: BrandsService, useValue: mockBrandsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BrandsController>(BrandsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(controller).toBeDefined());

  describe('findAll', () => {
    it('returns all brands', async () => {
      const brands = [{ id: 1, name: 'Nike' }];
      mockBrandsService.findAll.mockResolvedValue(brands);
      expect(await controller.findAll()).toEqual(brands);
    });
  });

  describe('findOne', () => {
    it('returns a single brand', async () => {
      const brand = { id: 1, name: 'Nike', slug: 'nike' };
      mockBrandsService.findOne.mockResolvedValue(brand);
      expect(await controller.findOne(1)).toEqual(brand);
      expect(mockBrandsService.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('create', () => {
    it('creates and returns brand', async () => {
      const created = { id: 3, name: 'Puma', slug: 'puma' };
      mockBrandsService.create.mockResolvedValue(created);
      const result = await controller.create({ name: 'Puma', slug: 'puma' });
      expect(result).toEqual(created);
    });
  });

  describe('update', () => {
    it('updates and returns brand', async () => {
      const updated = { id: 1, name: 'Nike Inc', slug: 'nike' };
      mockBrandsService.update.mockResolvedValue(updated);
      const result = await controller.update(1, { name: 'Nike Inc' });
      expect(result).toEqual(updated);
      expect(mockBrandsService.update).toHaveBeenCalledWith(1, {
        name: 'Nike Inc',
      });
    });
  });

  describe('remove', () => {
    it('removes a brand', async () => {
      mockBrandsService.remove.mockResolvedValue({ id: 1 });
      expect(await controller.remove(1)).toEqual({ id: 1 });
      expect(mockBrandsService.remove).toHaveBeenCalledWith(1);
    });
  });
});
