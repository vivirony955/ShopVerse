import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BlogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(authorId: number, dto: {
    title: string; slug: string; content: string; excerpt?: string;
    coverImage?: string; tags?: string[]; isPublished?: boolean;
  }) {
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
      select: { id: true, title: true, slug: true, excerpt: true, coverImage: true, tags: true, publishedAt: true, author: { select: { firstName: true, lastName: true } } },
    });
  }

  async findBySlug(slug: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { slug },
      include: { author: { select: { firstName: true, lastName: true } } },
    });
    if (!post || !post.isPublished) throw new NotFoundException('Post not found');
    return post;
  }

  async update(id: number, authorId: number, isAdmin: boolean, dto: Partial<{
    title: string; content: string; excerpt: string; coverImage: string;
    tags: string[]; isPublished: boolean;
  }>) {
    const post = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException();
    if (!isAdmin && post.authorId !== authorId) throw new ForbiddenException();

    const data: any = { ...dto };
    if (dto.isPublished && !post.publishedAt) data.publishedAt = new Date();

    return this.prisma.blogPost.update({ where: { id }, data });
  }

  async delete(id: number) {
    return this.prisma.blogPost.delete({ where: { id } });
  }
}
