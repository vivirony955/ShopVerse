// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Suspense } from "react";
import type { Metadata } from "next";
import ProductsClient from "./ProductsClient";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://shopverse.dev";

/**
 * Per-facet metadata so category / brand / search pages are individually
 * indexable — previously the filtered PLP had no metadata (the top SEO gap).
 * The canonical keeps the category/brand facets but drops volatile
 * sort/page/query params to consolidate ranking signals; search-result pages
 * are noindex,follow (infinite, low-value permutations).
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const first = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;
  const category = first(sp.category);
  const brand = first(sp.brand);
  const query = first(sp.q) ?? first(sp.search);

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const facet = [brand, category]
    .filter((s): s is string => Boolean(s))
    .map(cap)
    .join(" ");
  const label = query ? `Search: ${query}` : facet || "All Products";

  const title = `${label} | ShopVerse`;
  const description = query
    ? `Search results for "${query}" on ShopVerse — filter by price, category, brand, and rating.`
    : `Shop ${facet ? facet.toLowerCase() : "thousands of products"} on ShopVerse — filter by price, category, brand, and rating, with fast fulfillment.`;

  const canonicalParams = new URLSearchParams();
  if (category) canonicalParams.set("category", category);
  if (brand) canonicalParams.set("brand", brand);
  const qs = canonicalParams.toString();
  const canonical = qs ? `${baseUrl}/products?${qs}` : `${baseUrl}/products`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, type: "website", url: canonical },
    robots: query ? { index: false, follow: true } : undefined,
  };
}

export default function ProductsPage() {
  return (
    <Suspense>
      <ProductsClient />
    </Suspense>
  );
}
