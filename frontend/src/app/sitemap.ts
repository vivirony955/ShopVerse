// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://shopverse.com";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/products`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE_URL}/flash-sales`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE_URL}/wishlist`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.4 },
    { url: `${BASE_URL}/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/register`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
  ];

  // Product pages
  const productsData = await fetchJson<{ items: { id: number; updatedAt: string }[] }>(
    "/products?limit=500"
  );
  const productRoutes: MetadataRoute.Sitemap =
    productsData?.items?.map((p) => ({
      url: `${BASE_URL}/products/${p.id}`,
      lastModified: new Date(p.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })) ?? [];

  // Category pages
  const categories = await fetchJson<{ id: number; slug: string }[]>("/categories");
  const categoryRoutes: MetadataRoute.Sitemap =
    categories?.map((c) => ({
      url: `${BASE_URL}/products?category=${c.slug}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.6,
    })) ?? [];

  return [...staticRoutes, ...productRoutes, ...categoryRoutes];
}
