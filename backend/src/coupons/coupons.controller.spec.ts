// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Test, TestingModule } from '@nestjs/testing';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

describe('CouponsController', () => {
  let controller: CouponsController;

  const mockCouponsService = {
    validateCoupon: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CouponsController],
      providers: [{ provide: CouponsService, useValue: mockCouponsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CouponsController>(CouponsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(controller).toBeDefined());

  describe('validate', () => {
    it('validates a coupon and returns discount info', async () => {
      const response = {
        valid: true,
        discount: 200,
        coupon: { code: 'SAVE20' },
      };
      mockCouponsService.validateCoupon.mockResolvedValue(response);
      const result = await controller.validate({
        code: 'SAVE20',
        orderAmount: 1000,
      });
      expect(result).toEqual(response);
      expect(mockCouponsService.validateCoupon).toHaveBeenCalledWith(
        'SAVE20',
        1000,
      );
    });
  });

  describe('findAll', () => {
    it('returns all coupons', async () => {
      const coupons = [{ id: 1, code: 'SAVE20' }];
      mockCouponsService.findAll.mockResolvedValue(coupons);
      expect(await controller.findAll()).toEqual(coupons);
    });
  });

  describe('create', () => {
    it('creates and returns coupon', async () => {
      const created = { id: 5, code: 'FLAT50' };
      mockCouponsService.create.mockResolvedValue(created);
      const result = await controller.create({
        code: 'FLAT50',
        discountType: 'FIXED',
        discountValue: 50,
      });
      expect(result).toEqual(created);
    });
  });

  describe('update', () => {
    it('updates and returns coupon', async () => {
      const updated = { id: 1, isActive: false };
      mockCouponsService.update.mockResolvedValue(updated);
      const result = await controller.update(1, { isActive: false });
      expect(result).toEqual(updated);
      expect(mockCouponsService.update).toHaveBeenCalledWith(1, {
        isActive: false,
      });
    });
  });

  describe('remove', () => {
    it('removes coupon', async () => {
      mockCouponsService.remove.mockResolvedValue({ id: 1 });
      expect(await controller.remove(1)).toEqual({ id: 1 });
      expect(mockCouponsService.remove).toHaveBeenCalledWith(1);
    });
  });
});
