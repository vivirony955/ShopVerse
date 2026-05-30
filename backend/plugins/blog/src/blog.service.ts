// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
// W4.T1 grandfathered import — PrismaService is a kernel infra service.
// The SDK exposes the same connection via `kernel.db` (W1.T7), but the
// plugin currently consumes Prisma via Nest DI. SDK re-export migration
// is W4.CI3 (continuous).
import { PrismaService } from '../../../src/prisma/prisma.service';

@Injectable()
export class BlogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    authorId: number,
    dto: {
      title: string;
      slug: string;
      content: string;
      excerpt?: string;
      coverImage?: string;
      tags?: string[];
      isPublished?: boolean;
    },
  ) {
    return this.prisma.blogPost.create({
      data: {
        ...dto,
        authorId,
        tags: dto.tags ?? [],
        publishedAt: dto.isPublished ? new Date() : null,
      },
    });
  }

  async findAll(publishedOnly = true) {
    return this.prisma.blogPost.findMany({
      where: publishedOnly ? { isPublished: true } : {},
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        coverImage: true,
        tags: true,
        publishedAt: true,
        author: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async findBySlug(slug: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { slug },
      include: { author: { select: { firstName: true, lastName: true } } },
    });
    if (!post || !post.isPublished)
      throw new NotFoundException('Post not found');
    return post;
  }

  async update(
    id: number,
    authorId: number,
    isAdmin: boolean,
    dto: Partial<{
      title: string;
      content: string;
      excerpt: string;
      coverImage: string;
      tags: string[];
      isPublished: boolean;
    }>,
  ) {
    const post = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException();
    if (!isAdmin && post.authorId !== authorId) throw new ForbiddenException();

    const data: Prisma.BlogPostUpdateInput = { ...dto };
    if (dto.isPublished && !post.publishedAt) data.publishedAt = new Date();

    return this.prisma.blogPost.update({ where: { id }, data });
  }

  async delete(id: number) {
    return this.prisma.blogPost.delete({ where: { id } });
  }

  /**
   * GDPR cascade — invoked by the kernel via `user.beforeDelete` hook
   * (registered in BlogPluginModule's bootstrap). Drops every post the
   * user authored. Idempotent: deleteMany with no matches returns
   * `{ count: 0 }` cleanly. The user-deletion endpoint that triggers
   * this hook is not yet wired (W3.T7 note); contract is ready.
   */
  async deleteAllForUser(userId: number): Promise<void> {
    await this.prisma.blogPost.deleteMany({ where: { authorId: userId } });
  }
}
