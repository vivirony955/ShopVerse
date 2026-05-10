// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findOneByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, createdAt: true },
    });
  }

  async create(data: { email: string; password: string; firstName?: string; lastName?: string }) {
    return this.prisma.user.create({ data });
  }

  async updateProfile(id: number, data: { firstName?: string; lastName?: string; phone?: string }) {
    return this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, firstName: true, lastName: true, phone: true },
    });
  }

  // ─── Addresses ─────────────────────────────────────────────────────────────

  getAddresses(userId: number) {
    return this.prisma.address.findMany({ where: { userId } });
  }

  async addAddress(
    userId: number,
    data: {
      fullName: string;
      phone: string;
      line1: string;
      line2?: string;
      city: string;
      state: string;
      pincode: string;
      isDefault?: boolean;
    },
  ) {
    if (data.isDefault) {
      await this.prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    return this.prisma.address.create({ data: { ...data, userId } });
  }

  async updateAddress(userId: number, addressId: number, data: any) {
    const addr = await this.prisma.address.findFirst({ where: { id: addressId, userId } });
    if (!addr) throw new NotFoundException('Address not found');
    if (data.isDefault) {
      await this.prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    return this.prisma.address.update({ where: { id: addressId }, data });
  }

  async deleteAddress(userId: number, addressId: number) {
    const addr = await this.prisma.address.findFirst({ where: { id: addressId, userId } });
    if (!addr) throw new NotFoundException('Address not found');
    return this.prisma.address.delete({ where: { id: addressId } });
  }

  async setDefaultAddress(userId: number, addressId: number) {
    const addr = await this.prisma.address.findFirst({ where: { id: addressId, userId } });
    if (!addr) throw new NotFoundException('Address not found');
    await this.prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    return this.prisma.address.update({ where: { id: addressId }, data: { isDefault: true } });
  }
}
