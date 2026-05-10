// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QaService {
  constructor(private readonly prisma: PrismaService) {}

  async ask(userId: number, productId: number, question: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.productQuestion.create({ data: { userId, productId, question } });
  }

  async getForProduct(productId: number) {
    return this.prisma.productQuestion.findMany({
      where: { productId, isApproved: true },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
  }

  async answer(id: number, adminId: number, answer: string) {
    return this.prisma.productQuestion.update({
      where: { id },
      data: { answer, answeredBy: adminId, answeredAt: new Date(), isApproved: true },
    });
  }

  async approve(id: number) {
    return this.prisma.productQuestion.update({ where: { id }, data: { isApproved: true } });
  }

  async getPending() {
    return this.prisma.productQuestion.findMany({
      where: { isApproved: false },
      orderBy: { createdAt: 'desc' },
      include: { product: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } },
    });
  }

  async deleteQuestion(id: number, userId: number, isAdmin: boolean) {
    const q = await this.prisma.productQuestion.findUnique({ where: { id } });
    if (!q) throw new NotFoundException();
    if (!isAdmin && q.userId !== userId) throw new ForbiddenException();
    return this.prisma.productQuestion.delete({ where: { id } });
  }
}
