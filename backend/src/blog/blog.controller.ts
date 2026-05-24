// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BlogService } from './blog.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../common/types';

@ApiTags('Blog')
@Controller('blog')
export class BlogController {
  constructor(private readonly svc: BlogService) {}

  @Get()
  findAll(@Query('all') all?: string) {
    return this.svc.findAll(all !== 'true');
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.svc.findBySlug(slug);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MERCH)
  create(
    @CurrentUser() user: AuthUser,
    @Body()
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
    return this.svc.create(user.id, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MERCH)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    dto: Partial<{
      title: string;
      content: string;
      excerpt: string;
      coverImage: string;
      tags: string[];
      isPublished: boolean;
    }>,
  ) {
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user.role);
    return this.svc.update(id, user.id, isAdmin, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.svc.delete(id);
  }
}
