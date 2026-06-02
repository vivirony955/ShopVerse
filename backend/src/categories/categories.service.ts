// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.category.findMany({
      where: { parentId: null },
      include: { children: true },
    });
  }

  async findOne(id: number) {
    const cat = await this.prisma.category.findUnique({
      where: { id },
      include: { children: true, parent: true },
    });
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  create(data: { name: string; slug: string; parentId?: number }) {
    return this.prisma.category.create({ data });
  }

  async update(
    id: number,
    data: { name?: string; slug?: string; parentId?: number },
  ) {
    const cat = await this.prisma.category.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Category not found');
    return this.prisma.category.update({ where: { id }, data });
  }

  async remove(id: number) {
    const cat = await this.prisma.category.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Category not found');
    return this.prisma.category.delete({ where: { id } });
  }
}
