// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CronLockService } from '../common/cron-lock.service';
import { CreateFlashSaleDto, UpdateFlashSaleDto, AddFlashSaleProductDto } from './dto/flash-sale.dto';

@Injectable()
export class FlashSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cronLock: CronLockService,
  ) {}

  private includeProducts = {
    products: { include: { product: { include: { brand: true, category: true, variants: true } } } },
  };

  getActive() {
    const now = new Date();
    return this.prisma.flashSale.findMany({
      where: { status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } },
      include: this.includeProducts,
    });
  }

  findAll() {
    return this.prisma.flashSale.findMany({ include: this.includeProducts, orderBy: { startsAt: 'desc' } });
  }

  async findBySlug(slug: string) {
    const sale = await this.prisma.flashSale.findUnique({ where: { slug }, include: this.includeProducts });
    if (!sale) throw new NotFoundException('Flash sale not found');
    return sale;
  }

  create(dto: CreateFlashSaleDto) {
    const start = new Date(dto.startsAt);
    const end = new Date(dto.endsAt);
    if (end <= start) throw new BadRequestException('endsAt must be after startsAt');
    const now = new Date();
    const status = start <= now && end > now ? 'ACTIVE' : start > now ? 'SCHEDULED' : 'ENDED';
    return this.prisma.flashSale.create({
      data: { title: dto.title, slug: dto.slug, discountPct: dto.discountPct, startsAt: start, endsAt: end, status: status as any },
      include: this.includeProducts,
    });
  }

  async update(id: number, dto: UpdateFlashSaleDto) {
    const sale = await this.prisma.flashSale.findUnique({ where: { id } });
    if (!sale) throw new NotFoundException('Flash sale not found');
    return this.prisma.flashSale.update({ where: { id }, data: dto as any });
  }

  async remove(id: number) {
    const sale = await this.prisma.flashSale.findUnique({ where: { id } });
    if (!sale) throw new NotFoundException('Flash sale not found');
    return this.prisma.flashSale.delete({ where: { id } });
  }

  async addProduct(flashSaleId: number, dto: AddFlashSaleProductDto) {
    const sale = await this.prisma.flashSale.findUnique({ where: { id: flashSaleId } });
    if (!sale) throw new NotFoundException('Flash sale not found');
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.flashSaleProduct.create({ data: { flashSaleId, productId: dto.productId } });
  }

  async removeProduct(flashSaleId: number, productId: number) {
    const item = await this.prisma.flashSaleProduct.findUnique({
      where: { flashSaleId_productId: { flashSaleId, productId } },
    });
    if (!item) throw new NotFoundException('Product not in flash sale');
    return this.prisma.flashSaleProduct.delete({
      where: { flashSaleId_productId: { flashSaleId, productId } },
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async syncStatuses() {
    await this.cronLock.runExclusive('flash-sale-status-sync', 45_000, async () => {
      const now = new Date();
      await this.prisma.flashSale.updateMany({
        where: { status: 'SCHEDULED', startsAt: { lte: now }, endsAt: { gt: now } },
        data: { status: 'ACTIVE' },
      });
      await this.prisma.flashSale.updateMany({
        where: { status: { in: ['SCHEDULED', 'ACTIVE'] }, endsAt: { lte: now } },
        data: { status: 'ENDED' },
      });
    });
  }
}
