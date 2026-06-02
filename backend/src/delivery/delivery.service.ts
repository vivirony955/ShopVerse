// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertPincodeDto } from './dto/delivery.dto';

@Injectable()
export class DeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolve the store's configured country (StoreSettings singleton; defaults to US). */
  private async storeCountry(): Promise<string> {
    const s = await this.prisma.storeSettings.findUnique({ where: { id: 1 } });
    return s?.country ?? 'US';
  }

  async check(pincode: string, country?: string) {
    const ctry = country ?? (await this.storeCountry());
    const record = await this.prisma.pincodeServiceability.findUnique({
      where: { country_pincode: { country: ctry, pincode } },
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

  async upsert(dto: UpsertPincodeDto) {
    const country = dto.country ?? (await this.storeCountry());
    return this.prisma.pincodeServiceability.upsert({
      where: { country_pincode: { country, pincode: dto.pincode } },
      update: {
        isServiceable: dto.isServiceable ?? true,
        estimateDays: dto.estimateDays ?? 5,
        courier: dto.courier,
      },
      create: {
        country,
        pincode: dto.pincode,
        isServiceable: dto.isServiceable ?? true,
        estimateDays: dto.estimateDays ?? 5,
        courier: dto.courier,
      },
    });
  }

  findAll() {
    return this.prisma.pincodeServiceability.findMany({
      orderBy: { pincode: 'asc' },
    });
  }
}
