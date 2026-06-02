// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock, MockPrisma } from '../test-utils/prisma.mock';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── findOneByEmail ───────────────────────────────────────────────────────────

  describe('findOneByEmail', () => {
    it('returns user matching email', async () => {
      const user = { id: 1, email: 'user@example.com', password: 'hashed' };
      prisma.user.findUnique.mockResolvedValue(user);
      const result = await service.findOneByEmail('user@example.com');
      expect(result).toEqual(user);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
      });
    });

    it('returns null when email not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const result = await service.findOneByEmail('nobody@example.com');
      expect(result).toBeNull();
    });
  });

  // ─── findById ────────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns selected user fields by id', async () => {
      const user = {
        id: 1,
        email: 'user@example.com',
        role: 'USER',
        createdAt: new Date(),
      };
      prisma.user.findUnique.mockResolvedValue(user);
      const result = await service.findById(1);
      expect(result).toEqual(user);
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } }),
      );
    });

    it('returns null when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      expect(await service.findById(999)).toBeNull();
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a user with hashed password', async () => {
      const created = { id: 2, email: 'new@example.com', role: 'USER' };
      prisma.user.create.mockResolvedValue(created);
      const result = await service.create({
        email: 'new@example.com',
        password: 'hashed',
      });
      expect(result).toEqual(created);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { email: 'new@example.com', password: 'hashed' },
      });
    });
  });

  // ─── updateProfile ────────────────────────────────────────────────────────────

  describe('updateProfile', () => {
    it('updates user fields and returns selected fields', async () => {
      const updated = {
        id: 1,
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: null,
      };
      prisma.user.update.mockResolvedValue(updated);
      const result = await service.updateProfile(1, {
        firstName: 'John',
        lastName: 'Doe',
      });
      expect(result).toEqual(updated);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: { firstName: 'John', lastName: 'Doe' },
        }),
      );
    });

    it('can update only phone', async () => {
      prisma.user.update.mockResolvedValue({ id: 1, phone: '9999999999' });
      await service.updateProfile(1, { phone: '9999999999' });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { phone: '9999999999' } }),
      );
    });
  });

  // ─── Addresses ───────────────────────────────────────────────────────────────

  describe('getAddresses', () => {
    it('returns all addresses for a user', async () => {
      const addresses = [{ id: 1, userId: 1, city: 'Mumbai' }];
      prisma.address.findMany.mockResolvedValue(addresses);
      const result = await service.getAddresses(1);
      expect(result).toEqual(addresses);
      expect(prisma.address.findMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
    });

    it('returns empty array when user has no addresses', async () => {
      prisma.address.findMany.mockResolvedValue([]);
      expect(await service.getAddresses(1)).toEqual([]);
    });
  });

  describe('addAddress', () => {
    const addrData = {
      fullName: 'Jane Doe',
      phone: '9000000000',
      line1: '1 Main St',
      city: 'Delhi',
      state: 'DL',
      pincode: '110001',
    };

    it('creates address without touching existing defaults', async () => {
      const created = { id: 1, userId: 1, ...addrData, isDefault: false };
      prisma.address.create.mockResolvedValue(created);
      const result = await service.addAddress(1, addrData);
      expect(result).toEqual(created);
      expect(prisma.address.updateMany).not.toHaveBeenCalled();
    });

    it('resets other defaults when isDefault = true', async () => {
      prisma.address.updateMany.mockResolvedValue({ count: 2 });
      prisma.address.create.mockResolvedValue({ id: 2, isDefault: true });
      await service.addAddress(1, { ...addrData, isDefault: true });
      expect(prisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 1 },
        data: { isDefault: false },
      });
    });
  });

  describe('updateAddress', () => {
    it('updates and returns the address', async () => {
      prisma.address.findFirst.mockResolvedValue({
        id: 1,
        userId: 1,
        city: 'Mumbai',
      });
      prisma.address.update.mockResolvedValue({ id: 1, city: 'Pune' });
      const result = await service.updateAddress(1, 1, { city: 'Pune' });
      expect(result.city).toBe('Pune');
    });

    it('throws NotFoundException when address not owned by user', async () => {
      prisma.address.findFirst.mockResolvedValue(null);
      await expect(
        service.updateAddress(1, 99, { city: 'Pune' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('resets other defaults when isDefault = true', async () => {
      prisma.address.findFirst.mockResolvedValue({ id: 1, userId: 1 });
      prisma.address.updateMany.mockResolvedValue({ count: 1 });
      prisma.address.update.mockResolvedValue({ id: 1, isDefault: true });
      await service.updateAddress(1, 1, { isDefault: true });
      expect(prisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 1 },
        data: { isDefault: false },
      });
    });
  });

  describe('deleteAddress', () => {
    it('deletes and returns the address', async () => {
      prisma.address.findFirst.mockResolvedValue({ id: 1, userId: 1 });
      prisma.address.delete.mockResolvedValue({ id: 1 });
      const result = await service.deleteAddress(1, 1);
      expect(result).toEqual({ id: 1 });
      expect(prisma.address.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('throws NotFoundException for address not belonging to user', async () => {
      prisma.address.findFirst.mockResolvedValue(null);
      await expect(service.deleteAddress(1, 99)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('setDefaultAddress', () => {
    it('sets address as default and unsets others', async () => {
      prisma.address.findFirst.mockResolvedValue({ id: 1, userId: 1 });
      prisma.address.updateMany.mockResolvedValue({ count: 3 });
      prisma.address.update.mockResolvedValue({ id: 1, isDefault: true });
      const result = await service.setDefaultAddress(1, 1);
      expect(result.isDefault).toBe(true);
      expect(prisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 1 },
        data: { isDefault: false },
      });
      expect(prisma.address.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isDefault: true },
      });
    });

    it('throws NotFoundException when address not owned by user', async () => {
      prisma.address.findFirst.mockResolvedValue(null);
      await expect(service.setDefaultAddress(1, 99)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
