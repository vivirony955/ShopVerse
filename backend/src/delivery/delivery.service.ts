// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertPincodeDto } from './dto/delivery.dto';

@Injectable()
export class DeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  async check(pincode: string) {
    const record = await this.prisma.pincodeServiceability.findUnique({
      where: { pincode },
    });

    if (record) {
      return {
        pincode,
        isServiceable: record.isServiceable,
        estimateDays: record.estimateDays,
        courier: record.courier,
        message: record.isServiceable
          ? `Delivery available. Estimated delivery in ${record.estimateDays}–${record.estimateDays + 2} days.`
          : 'Delivery not available in your area.',
      };
    }

    // Default: serviceable with 7 day estimate if not in database
    return {
      pincode,
      isServiceable: true,
      estimateDays: 7,
      courier: 'Standard Delivery',
      message: 'Delivery available. Estimated delivery in 7–9 days.',
    };
  }

  upsert(dto: UpsertPincodeDto) {
    return this.prisma.pincodeServiceability.upsert({
      where: { pincode: dto.pincode },
      update: {
        isServiceable: dto.isServiceable ?? true,
        estimateDays: dto.estimateDays ?? 5,
        courier: dto.courier,
      },
      create: {
        pincode: dto.pincode,
        isServiceable: dto.isServiceable ?? true,
        estimateDays: dto.estimateDays ?? 5,
        courier: dto.courier,
      },
    });
  }

  findAll() {
    return this.prisma.pincodeServiceability.findMany({ orderBy: { pincode: 'asc' } });
  }
}
