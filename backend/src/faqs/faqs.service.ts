// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFaqDto, UpdateFaqDto } from './dto/faq.dto';

@Injectable()
export class FaqsService {
  constructor(private readonly prisma: PrismaService) {}

  findByProduct(productId: number) {
    return this.prisma.productFaq.findMany({
      where: { productId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(productId: number, dto: CreateFaqDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.productFaq.create({
      data: {
        productId,
        question: dto.question,
        answer: dto.answer,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async update(id: number, dto: UpdateFaqDto) {
    const faq = await this.prisma.productFaq.findUnique({ where: { id } });
    if (!faq) throw new NotFoundException('FAQ not found');
    return this.prisma.productFaq.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const faq = await this.prisma.productFaq.findUnique({ where: { id } });
    if (!faq) throw new NotFoundException('FAQ not found');
    return this.prisma.productFaq.delete({ where: { id } });
  }
}
