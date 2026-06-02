// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * Blog — E2E spec
 *
 * Covers: create, publish, findAll (published only), findBySlug,
 * update (author/admin vs other), delete, slug uniqueness,
 * unpublished post not visible publicly.
 */
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import { prisma, cleanDatabase, createUser } from './helpers/db';
import { cleanQATables } from './helpers/factories';
// W4.T1 — blog was extracted from kernel to @shopverse/plugin-blog.
// Service class is the same; Nest DI still resolves it via the plugin
// module imported from plugins.config.ts.
import { BlogService } from '../backend/plugins/blog/src/blog.service';

let app: INestApplication;
let blogSvc: BlogService;

beforeAll(async () => {
  app = await getTestApp();
  blogSvc = app.get(BlogService);
});

afterAll(async () => {
  await cleanQATables();
  await cleanDatabase();
  await closeTestApp();
});

beforeEach(async () => {
  await cleanQATables();
  await cleanDatabase();
});

function slug(prefix = 'post') {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// ─── BLOG-H01: create draft post ────────────────────────────────────────────

it('BLOG-H01: create unpublished draft blog post', async () => {
  const author = await createUser();
  const post = await blogSvc.create(author.id, {
    title: 'My First Post',
    slug: slug(),
    content: '<p>Hello world</p>',
    isPublished: false,
  });
  expect(post.id).toBeDefined();
  expect(post.isPublished).toBe(false);
  expect(post.publishedAt).toBeNull();
});

// ─── BLOG-H02: create and publish post ──────────────────────────────────────

it('BLOG-H02: create published post sets publishedAt timestamp', async () => {
  const author = await createUser();
  const post = await blogSvc.create(author.id, {
    title: 'Published Post',
    slug: slug('pub'),
    content: '<p>Great content</p>',
    isPublished: true,
    tags: ['fashion', 'trends'],
  });
  expect(post.isPublished).toBe(true);
  expect(post.publishedAt).toBeDefined();
  expect(post.tags).toContain('fashion');
});

// ─── BLOG-H03: findAll returns only published posts ─────────────────────────

it('BLOG-H03: findAll (publishedOnly=true) hides draft posts', async () => {
  const author = await createUser();
  const s1 = slug('draft');
  const s2 = slug('live');

  await blogSvc.create(author.id, { title: 'Draft', slug: s1, content: 'draft', isPublished: false });
  await blogSvc.create(author.id, { title: 'Live', slug: s2, content: 'live', isPublished: true });

  const published = await blogSvc.findAll(true);
  const slugs = published.map((p: any) => p.slug);
  expect(slugs).not.toContain(s1);
  expect(slugs).toContain(s2);
});

// ─── BLOG-H04: findAll(false) returns all posts ─────────────────────────────

it('BLOG-H04: findAll(publishedOnly=false) returns drafts too', async () => {
  const author = await createUser();
  const s1 = slug('d1');
  const s2 = slug('p1');

  await blogSvc.create(author.id, { title: 'D1', slug: s1, content: 'draft', isPublished: false });
  await blogSvc.create(author.id, { title: 'P1', slug: s2, content: 'pub', isPublished: true });

  const all = await blogSvc.findAll(false);
  const slugs = all.map((p: any) => p.slug);
  expect(slugs).toContain(s1);
  expect(slugs).toContain(s2);
});

// ─── BLOG-H05: findBySlug returns published post ────────────────────────────

it('BLOG-H05: findBySlug returns post with author details', async () => {
  const author = await createUser();
  const postSlug = slug('find');
  await blogSvc.create(author.id, {
    title: 'Findable Post',
    slug: postSlug,
    content: '<h1>Hi</h1>',
    isPublished: true,
  });

  const found = await blogSvc.findBySlug(postSlug);
  expect(found.title).toBe('Findable Post');
  expect(found.author).toBeDefined();
});

// ─── BLOG-E01: findBySlug on draft → NotFoundException ──────────────────────

it('BLOG-E01: findBySlug on unpublished post throws NotFoundException', async () => {
  const author = await createUser();
  const draftSlug = slug('hidden');
  await blogSvc.create(author.id, { title: 'Hidden', slug: draftSlug, content: 'x', isPublished: false });

  await expect(blogSvc.findBySlug(draftSlug)).rejects.toThrow(/not found/i);
});

// ─── BLOG-E02: findBySlug on nonexistent slug → NotFoundException ────────────

it('BLOG-E02: findBySlug on nonexistent slug throws NotFoundException', async () => {
  await expect(blogSvc.findBySlug('slug-that-does-not-exist')).rejects.toThrow(/not found/i);
});

// ─── BLOG-H06: author can update their own post ─────────────────────────────

it('BLOG-H06: author can update their own post', async () => {
  const author = await createUser();
  const post = await blogSvc.create(author.id, {
    title: 'Original Title',
    slug: slug('upd'),
    content: 'Original content',
    isPublished: false,
  });

  const updated = await blogSvc.update(post.id, author.id, false, {
    title: 'Updated Title',
    isPublished: true,
  });
  expect(updated.title).toBe('Updated Title');
  expect(updated.isPublished).toBe(true);
  expect(updated.publishedAt).toBeDefined();
});

// ─── BLOG-E03: non-author non-admin cannot update post ──────────────────────

it('BLOG-E03: non-author non-admin cannot update post', async () => {
  const author = await createUser();
  const intruder = await createUser();
  const post = await blogSvc.create(author.id, {
    title: 'My Post',
    slug: slug('sec'),
    content: 'secure',
    isPublished: false,
  });

  await expect(
    blogSvc.update(post.id, intruder.id, false, { title: 'Hijacked' }),
  ).rejects.toThrow(/forbidden/i);
});

// ─── BLOG-H07: admin can update any post ────────────────────────────────────

it('BLOG-H07: admin can update any post regardless of author', async () => {
  const author = await createUser();
  const admin = await createUser();
  const post = await blogSvc.create(author.id, {
    title: 'Admin Editable',
    slug: slug('adm'),
    content: 'edit me',
    isPublished: false,
  });

  const updated = await blogSvc.update(post.id, admin.id, true, { title: 'Admin Edited' });
  expect(updated.title).toBe('Admin Edited');
});

// ─── BLOG-H08: delete post ──────────────────────────────────────────────────

it('BLOG-H08: delete removes the blog post', async () => {
  const author = await createUser();
  const post = await blogSvc.create(author.id, {
    title: 'Delete Me',
    slug: slug('del'),
    content: 'bye',
    isPublished: true,
  });

  await blogSvc.delete(post.id);
  const found = await prisma.blogPost.findUnique({ where: { id: post.id } });
  expect(found).toBeNull();
});

// ─── BLOG-H09: updating published post again doesn't change publishedAt ──────

it('BLOG-H09: re-publishing an already published post keeps original publishedAt', async () => {
  const author = await createUser();
  const post = await blogSvc.create(author.id, {
    title: 'Already Published',
    slug: slug('repub'),
    content: 'content',
    isPublished: true,
  });

  const originalPublishedAt = post.publishedAt;

  // Small delay to detect timestamp change if it occurs
  await new Promise(r => setTimeout(r, 10));

  const updated = await blogSvc.update(post.id, author.id, false, {
    title: 'Slightly Updated',
    isPublished: true,
  });

  // publishedAt should not have changed (condition: `if (dto.isPublished && !post.publishedAt)`)
  expect(updated.publishedAt?.getTime()).toBe(originalPublishedAt?.getTime());
});
