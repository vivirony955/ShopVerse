// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis.service';

// W4 PERF: cache TTLs. Short TTL keeps stale window bounded even if invalidation misses.
const PLP_CACHE_TTL_SECONDS = 60;
const PDP_CACHE_TTL_SECONDS = 120;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Stable hash of PLP filter object → cache key suffix. */
  private plpKey(filters: Record<string, unknown>): string {
    const canonical = JSON.stringify(
      Object.keys(filters)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          const v = (filters as any)[k];
          if (v !== undefined && v !== null && v !== '') acc[k] = v;
          return acc;
        }, {}),
    );
    return `plp:${createHash('sha1').update(canonical).digest('hex').slice(0, 16)}`;
  }

  private pdpKey(id: number): string {
    return `pdp:id:${id}`;
  }

  /** Called after any mutation that can change PLP/PDP output. Best-effort. */
  private async invalidateProductCaches(productId?: number): Promise<void> {
    // PLP: wipe all listing keys — filter combinations are too many to target precisely.
    await this.redis.delByPattern('plp:*');
    if (productId !== undefined) await this.redis.del(this.pdpKey(productId));
  }

  async findAll(filters: {
    search?: string;
    category?: string;
    brand?: string;
    minPrice?: number;
    maxPrice?: number;
    size?: string;
    color?: string;
    tags?: string;
    sort?: string;
    order?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }) {
    // W4 + P-16 PERF: read-through cache with single-flight stampede protection.
    const cacheKey = this.plpKey(filters);
    return this.redis.getOrLoad(cacheKey, PLP_CACHE_TTL_SECONDS, () =>
      this.loadPlp(filters),
    );
  }

  /** DB-backed PLP loader — extracted so getOrLoad can single-flight it. */
  private async loadPlp(filters: {
    search?: string;
    category?: string;
    brand?: string;
    minPrice?: number;
    maxPrice?: number;
    size?: string;
    color?: string;
    tags?: string;
    sort?: string;
    order?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }): Promise<{
    items: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      search,
      category,
      brand,
      minPrice,
      maxPrice,
      size,
      color,
      tags,
      sort,
      order = 'asc',
      page = 1,
      limit = 20,
    } = filters;

    const where: any = { isActive: true };

    // F1-01: PostgreSQL FTS via GIN-indexed tsvector. Falls back to LIKE only if
    // the search term has special chars that would break tsquery.
    let ftsProductIds: number[] | null = null;
    if (search) {
      try {
        // websearch_to_tsquery handles partial words, phrases, and boolean ops safely.
        const rows = await this.prisma.$queryRaw<
          { id: number; rank: number }[]
        >`
          SELECT p.id, ts_rank(
            to_tsvector('english', p.name || ' ' || p.description || ' ' || array_to_string(p.tags, ' ')),
            websearch_to_tsquery('english', ${search})
          ) AS rank
          FROM "Product" p
          WHERE p."isActive" = true
            AND to_tsvector('english', p.name || ' ' || p.description || ' ' || array_to_string(p.tags, ' '))
              @@ websearch_to_tsquery('english', ${search})
          ORDER BY rank DESC
          LIMIT 500
        `;
        ftsProductIds = rows.map((r) => r.id);
        if (ftsProductIds.length === 0) {
          // FTS found nothing — prefix fallback for very short queries
          where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { tags: { hasSome: [search.toLowerCase()] } },
          ];
        } else {
          where.id = { in: ftsProductIds };
        }
      } catch {
        // Safety fallback if tsquery parsing fails (e.g., query = "&&&")
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }
    }
    if (category) where.category = { slug: category };
    if (brand) where.brand = { slug: brand };
    if (tags) where.tags = { hasSome: tags.split(',').map((t) => t.trim()) };
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.basePrice = {};
      if (minPrice !== undefined) where.basePrice.gte = Number(minPrice);
      if (maxPrice !== undefined) where.basePrice.lte = Number(maxPrice);
    }
    if (size || color) {
      where.variants = {
        some: {
          ...(size && { size }),
          ...(color && { color }),
          stock: { gt: 0 },
        },
      };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // B-14 PERF: drop `reviews` include — PLP now reads from pre-computed
    // Product.avgRating / reviewCount cache (maintained by reviews.service.ts).
    // When FTS is active, preserve relevance order; otherwise use requested sort.
    const orderBy: Prisma.ProductOrderByWithRelationInput | undefined =
      ftsProductIds && ftsProductIds.length > 0
        ? undefined // order preserved by ftsProductIds array via Prisma { in: [...] }
        : sort
          ? { [sort]: order as Prisma.SortOrder }
          : { createdAt: Prisma.SortOrder.desc };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          brand: { select: { id: true, name: true, slug: true } },
          category: { select: { id: true, name: true, slug: true } },
          variants: true,
        },
        ...(orderBy && { orderBy }),
        skip,
        take,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items,
      total,
      page: Number(page),
      limit: take,
      totalPages: Math.ceil(total / take),
    };
  }

  async findOne(id: number) {
    // W4 + P-16 PERF: PDP read-through cache with single-flight stampede protection.
    // NotFoundException must propagate — we let the loader throw; getOrLoad
    // doesn't cache the null and the rejection bubbles to all coalesced waiters.
    return this.redis.getOrLoad(
      this.pdpKey(id),
      PDP_CACHE_TTL_SECONDS,
      async () => {
        const product = await this.prisma.product.findUnique({
          where: { id },
          include: {
            brand: true,
            category: true,
            variants: true,
            reviews: {
              include: {
                user: { select: { id: true, firstName: true, lastName: true } },
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        });
        if (!product) throw new NotFoundException('Product not found');
        return product;
      },
    );
  }

  async create(data: {
    name: string;
    slug: string;
    description: string;
    brandId: number;
    categoryId: number;
    basePrice: number;
    discountPct?: number;
    images: string[];
    tags?: string[];
  }) {
    const product = await this.prisma.product.create({
      data: { ...data, tags: data.tags ?? [] },
      include: { brand: true, category: true },
    });
    await this.invalidateProductCaches(); // new row affects PLP listings
    return product;
  }

  async update(id: number, data: any) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found');
    const updated = await this.prisma.product.update({
      where: { id },
      data,
      include: { brand: true, category: true },
    });
    await this.invalidateProductCaches(id);
    return updated;
  }

  async remove(id: number) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    const deleted = await this.prisma.product.delete({ where: { id } });
    await this.invalidateProductCaches(id);
    return deleted;
  }

  // ─── Variants ───────────────────────────────────────────────────────────────

  async addVariant(
    productId: number,
    data: { size: string; color: string; stock: number; sku: string },
  ) {
    const variant = await this.prisma.variant.create({
      data: { ...data, productId },
    });
    await this.invalidateProductCaches(productId);
    return variant;
  }

  async updateVariant(
    productId: number,
    variantId: number,
    data: {
      size?: string;
      color?: string;
      stock?: number;
      backorderAllowed?: boolean;
    },
  ) {
    const variant = await this.prisma.variant.findFirst({
      where: { id: variantId, productId },
    });
    if (!variant) throw new NotFoundException('Variant not found');
    const updated = await this.prisma.variant.update({
      where: { id: variantId },
      data,
    });
    await this.invalidateProductCaches(productId);
    return updated;
  }

  async deleteVariant(productId: number, variantId: number) {
    const variant = await this.prisma.variant.findFirst({
      where: { id: variantId, productId },
    });
    if (!variant) throw new NotFoundException('Variant not found');
    const deleted = await this.prisma.$transaction(async (tx) => {
      // Remove warehouse inventory rows before deleting the variant to avoid FK violation.
      await tx.warehouseInventory.deleteMany({ where: { variantId } });
      return tx.variant.delete({ where: { id: variantId } });
    });
    await this.invalidateProductCaches(productId);
    return deleted;
  }

  /**
   * Subscribe an email (optionally phone) to a back-in-stock alert for an OOS variant.
   * FINAL §3.2. Idempotent via partial unique index on (variantId, email) WHERE notifiedAt IS NULL.
   */
  async subscribeStockNotification(
    variantId: number,
    email: string,
    phone?: string,
  ) {
    if (!email || !email.includes('@'))
      throw new BadRequestException('Valid email required');
    const variant = await this.prisma.variant.findUnique({
      where: { id: variantId },
    });
    if (!variant) throw new NotFoundException('Variant not found');
    try {
      return await this.prisma.stockNotification.create({
        data: { variantId, email: email.toLowerCase(), phone },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') return { message: 'Already subscribed' };
      throw e;
    }
  }

  /**
   * Cross-sell: products from the same category, excluding the current one.
   * Ranked by discount (deals first) then recency.
   */
  async getRelated(productId: number, limit = 8) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { categoryId: true, basePrice: true },
    });
    if (!product) return [];

    return this.prisma.product.findMany({
      where: {
        id: { not: productId },
        categoryId: product.categoryId,
        isActive: true,
      },
      include: { brand: true, category: true, variants: { take: 1 } },
      orderBy: [{ discountPct: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
  }

  /**
   * Frequently bought together: find products co-purchased in the same orders.
   * Uses order history as the signal — collaborative filtering lite.
   */
  async getFrequentlyBoughtTogether(productId: number, limit = 4) {
    // Get all order IDs that contain this product's variants
    const orderIds = await this.prisma.orderItem.findMany({
      where: { variant: { productId } },
      select: { orderId: true },
      distinct: ['orderId'],
      take: 500, // cap for performance
    });
    if (orderIds.length === 0) return this.getRelated(productId, limit);

    const ids = orderIds.map((o) => o.orderId);

    // Find other products in those same orders, ranked by co-occurrence count
    const coItems = await this.prisma.orderItem.groupBy({
      by: ['variantId'],
      where: {
        orderId: { in: ids },
        variant: { productId: { not: productId } },
      },
      _count: { variantId: true },
      orderBy: { _count: { variantId: 'desc' } },
      take: limit * 2, // overfetch then dedupe by product
    });

    const variantIds = coItems.map((i) => i.variantId);
    const variants = await this.prisma.variant.findMany({
      where: { id: { in: variantIds } },
      include: {
        product: {
          include: { brand: true, category: true, variants: { take: 1 } },
        },
      },
    });

    // Deduplicate by productId
    const seen = new Set<number>();
    const products: any[] = [];
    for (const v of variants) {
      if (!seen.has(v.productId) && v.product.isActive) {
        seen.add(v.productId);
        products.push(v.product);
        if (products.length >= limit) break;
      }
    }

    // Fill remaining slots with related if not enough co-purchase data
    if (products.length < limit) {
      const related = await this.getRelated(productId, limit - products.length);
      const existingIds = new Set(products.map((p) => p.id));
      products.push(...related.filter((p) => !existingIds.has(p.id)));
    }

    return products;
  }

  /**
   * Upsell: higher-priced products in the same category (premium alternatives).
   * Shown as "Upgrade to" suggestions.
   */
  async getUpsells(productId: number, limit = 4) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { categoryId: true, basePrice: true },
    });
    if (!product) return [];

    return this.prisma.product.findMany({
      where: {
        id: { not: productId },
        categoryId: product.categoryId,
        isActive: true,
        basePrice: { gt: product.basePrice },
      },
      include: { brand: true, category: true, variants: { take: 1 } },
      orderBy: { basePrice: 'asc' }, // cheapest premium option first
      take: limit,
    });
  }

  // F1-06: Get size chart for a category (walks up hierarchy if not found)
  async getSizeChart(categoryId: number) {
    let currentId: number | null = categoryId;
    while (currentId) {
      const chart = await this.prisma.sizeChart.findFirst({
        where: { categoryId: currentId },
      });
      if (chart) return chart;
      // Walk up to parent category
      const cat = await this.prisma.category.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
      currentId = cat?.parentId ?? null;
    }
    return null;
  }

  /**
   * F1-20: Bulk product upload from CSV.
   * CSV columns: name,slug,description,brandId,categoryId,basePrice,discountPct,images,tags
   * images and tags are pipe-separated ("|") within the cell.
   * Returns { created, updated, errors[] }
   */
  async bulkUpload(csvText: string) {
    const lines = csvText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2)
      throw new BadRequestException(
        'CSV must have header + at least one data row',
      );

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const required = [
      'name',
      'slug',
      'description',
      'brandid',
      'categoryid',
      'baseprice',
    ];
    const missing = required.filter((r) => !headers.includes(r));
    if (missing.length)
      throw new BadRequestException(
        `CSV missing columns: ${missing.join(', ')}`,
      );

    const results = { created: 0, updated: 0, errors: [] as string[] };

    for (let i = 1; i < lines.length; i++) {
      const cols = this.parseCSVLine(lines[i]);
      if (cols.length !== headers.length) {
        results.errors.push(`Row ${i + 1}: column count mismatch`);
        continue;
      }
      const row: Record<string, string> = {};
      headers.forEach((h, j) => {
        row[h] = cols[j]?.trim() ?? '';
      });

      try {
        const data = {
          name: row['name'],
          slug:
            row['slug'] ||
            row['name']
              .toLowerCase()
              .replace(/\s+/g, '-')
              .replace(/[^a-z0-9-]/g, ''),
          description: row['description'],
          brandId: parseInt(row['brandid'], 10),
          categoryId: parseInt(row['categoryid'], 10),
          basePrice: parseFloat(row['baseprice']),
          discountPct: row['discountpct'] ? parseFloat(row['discountpct']) : 0,
          images: row['images']
            ? row['images']
                .split('|')
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
          tags: row['tags']
            ? row['tags']
                .split('|')
                .map((s) => s.trim().toLowerCase())
                .filter(Boolean)
            : [],
        };

        const existing = await this.prisma.product.findUnique({
          where: { slug: data.slug },
        });
        if (existing) {
          await this.prisma.product.update({
            where: { slug: data.slug },
            data,
          });
          results.updated++;
        } else {
          await this.prisma.product.create({ data });
          results.created++;
        }
      } catch (e: any) {
        results.errors.push(`Row ${i + 1}: ${e?.message ?? 'Unknown error'}`);
      }
    }

    await this.invalidateProductCaches();
    return results;
  }

  /** Minimal RFC 4180 CSV line parser (handles quoted fields with commas). */
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  /**
   * F1-03: Faceted filter counts.
   * Returns counts for brands, categories, sizes, colors, and price buckets
   * given the current filter context (so counts reflect what's available, not total).
   */
  async getFacets(filters: {
    search?: string;
    category?: string;
    brand?: string;
    minPrice?: number;
    maxPrice?: number;
    size?: string;
    color?: string;
    tags?: string;
  }) {
    const where: any = { isActive: true };
    if (filters.category) where.category = { slug: filters.category };
    if (filters.brand) where.brand = { slug: filters.brand };
    if (filters.tags)
      where.tags = { hasSome: filters.tags.split(',').map((t) => t.trim()) };
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      where.basePrice = {};
      if (filters.minPrice !== undefined)
        where.basePrice.gte = Number(filters.minPrice);
      if (filters.maxPrice !== undefined)
        where.basePrice.lte = Number(filters.maxPrice);
    }
    if (filters.size || filters.color) {
      where.variants = {
        some: {
          ...(filters.size && { size: filters.size }),
          ...(filters.color && { color: filters.color }),
          stock: { gt: 0 },
        },
      };
    }

    const [brands, categories, variants, priceRange] = await Promise.all([
      // Brand facet counts (exclude brand filter so user can switch)
      this.prisma.brand.findMany({
        where: { products: { some: { ...where, brand: undefined } } },
        select: {
          id: true,
          name: true,
          slug: true,
          _count: {
            select: { products: { where: { ...where, brand: undefined } } },
          },
        },
        orderBy: { name: 'asc' },
      }),
      // Category facet counts
      this.prisma.category.findMany({
        where: { products: { some: { ...where, category: undefined } } },
        select: {
          id: true,
          name: true,
          slug: true,
          _count: {
            select: { products: { where: { ...where, category: undefined } } },
          },
        },
        orderBy: { name: 'asc' },
      }),
      // Size + color facets via raw groupBy on Variant table
      this.prisma.variant.groupBy({
        by: ['size', 'color'],
        where: { product: where, stock: { gt: 0 } },
        _count: { id: true },
      }),
      // Price range for slider
      this.prisma.product.aggregate({
        where,
        _min: { basePrice: true },
        _max: { basePrice: true },
      }),
    ]);

    // Aggregate size/color counts
    const sizeMap = new Map<string, number>();
    const colorMap = new Map<string, number>();
    for (const v of variants) {
      sizeMap.set(v.size, (sizeMap.get(v.size) ?? 0) + v._count.id);
      colorMap.set(v.color, (colorMap.get(v.color) ?? 0) + v._count.id);
    }

    return {
      brands: brands.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        count: b._count.products,
      })),
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        count: c._count.products,
      })),
      sizes: [...sizeMap.entries()]
        .map(([size, count]) => ({ size, count }))
        .sort((a, b) => a.size.localeCompare(b.size)),
      colors: [...colorMap.entries()]
        .map(([color, count]) => ({ color, count }))
        .sort((a, b) => a.color.localeCompare(b.color)),
      priceRange: {
        min: priceRange._min.basePrice ?? 0,
        max: priceRange._max.basePrice ?? 0,
      },
    };
  }

  async autocomplete(q: string) {
    if (!q || q.length < 2) return [];
    try {
      // F1-01: FTS-backed autocomplete — prefix match with :* operator
      const term = q.trim().replace(/[^a-zA-Z0-9\s]/g, '') + ':*';
      const rows = await this.prisma.$queryRaw<
        {
          id: number;
          name: string;
          slug: string;
          images: string[];
          basePrice: number;
          discountPct: number;
          categoryName: string;
        }[]
      >`
        SELECT p.id, p.name, p.slug, p.images, p."basePrice", p."discountPct",
               c.name AS "categoryName"
        FROM "Product" p
        JOIN "Category" c ON c.id = p."categoryId"
        WHERE p."isActive" = true
          AND to_tsvector('english', p.name || ' ' || array_to_string(p.tags, ' '))
              @@ to_tsquery('english', ${term})
        ORDER BY ts_rank(
          to_tsvector('english', p.name || ' ' || array_to_string(p.tags, ' ')),
          to_tsquery('english', ${term})
        ) DESC
        LIMIT 8
      `;
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        images: r.images,
        basePrice: r.basePrice,
        discountPct: r.discountPct,
        category: { name: r.categoryName },
      }));
    } catch {
      // Fallback for queries that produce invalid tsquery
      return this.prisma.product.findMany({
        where: {
          isActive: true,
          name: { contains: q, mode: 'insensitive' },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          images: true,
          category: { select: { name: true } },
          basePrice: true,
          discountPct: true,
        },
        take: 8,
      });
    }
  }

  // ─── F2-11: Search logging + trending ────────────────────────────────────────

  async logSearch(query: string, userId: number | null, resultCount: number) {
    if (!query || query.trim().length < 2) return;
    await this.prisma.searchLog.create({
      data: {
        query: query.trim().toLowerCase(),
        userId: userId ?? undefined,
        resultCount,
      },
    });
  }

  async getTrendingSearches(limit = 10) {
    // Aggregate top queries from the last 7 days
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const rows = await this.prisma.$queryRaw<
      { query: string; count: bigint }[]
    >`
      SELECT query, COUNT(*) AS count
      FROM "SearchLog"
      WHERE "createdAt" >= ${since} AND length(query) >= 3
      GROUP BY query
      ORDER BY count DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({ query: r.query, count: Number(r.count) }));
  }

  // ─── F2-19: Loyalty tiers ────────────────────────────────────────────────────

  async getLoyaltyTiers() {
    return this.prisma.loyaltyTier.findMany({ orderBy: { minPoints: 'asc' } });
  }

  async getUserTier(loyaltyPoints: number) {
    const tiers = await this.prisma.loyaltyTier.findMany({
      orderBy: { minPoints: 'desc' },
    });
    const tier = tiers.find((t) => loyaltyPoints >= t.minPoints);
    return tier ?? null;
  }

  async upsertLoyaltyTier(dto: {
    name: string;
    minPoints: number;
    earnMultiplier: number;
    perks: string[];
  }) {
    return this.prisma.loyaltyTier.upsert({
      where: { name: dto.name },
      create: dto,
      update: dto,
    });
  }
}
