// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

describe('CategoriesController', () => {
  let controller: CategoriesController;

  const mockCategoriesService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        { provide: CategoriesService, useValue: mockCategoriesService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CategoriesController>(CategoriesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(controller).toBeDefined());

  describe('findAll', () => {
    it('returns category tree', async () => {
      const tree = [{ id: 1, name: 'Men', children: [] }];
      mockCategoriesService.findAll.mockResolvedValue(tree);
      expect(await controller.findAll()).toEqual(tree);
      expect(mockCategoriesService.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('returns a single category', async () => {
      const cat = { id: 2, name: 'Women', children: [], parent: null };
      mockCategoriesService.findOne.mockResolvedValue(cat);
      expect(await controller.findOne(2)).toEqual(cat);
      expect(mockCategoriesService.findOne).toHaveBeenCalledWith(2);
    });
  });

  describe('create', () => {
    it('creates and returns a category', async () => {
      const created = { id: 5, name: 'Kids', slug: 'kids' };
      mockCategoriesService.create.mockResolvedValue(created);
      const result = await controller.create({ name: 'Kids', slug: 'kids' });
      expect(result).toEqual(created);
      expect(mockCategoriesService.create).toHaveBeenCalledWith({
        name: 'Kids',
        slug: 'kids',
      });
    });
  });

  describe('update', () => {
    it('updates and returns category', async () => {
      const updated = { id: 1, name: 'Mens', slug: 'mens' };
      mockCategoriesService.update.mockResolvedValue(updated);
      const result = await controller.update(1, { name: 'Mens' });
      expect(result).toEqual(updated);
      expect(mockCategoriesService.update).toHaveBeenCalledWith(1, {
        name: 'Mens',
      });
    });
  });

  describe('remove', () => {
    it('deletes a category', async () => {
      mockCategoriesService.remove.mockResolvedValue({ id: 1 });
      expect(await controller.remove(1)).toEqual({ id: 1 });
      expect(mockCategoriesService.remove).toHaveBeenCalledWith(1);
    });
  });
});
