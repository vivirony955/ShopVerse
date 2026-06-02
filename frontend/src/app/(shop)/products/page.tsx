// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { Suspense } from "react";
import type { Metadata } from "next";
import ProductsClient from "./ProductsClient";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://shopverse.dev";

type SP = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Derive the facet label + canonical URL from the PLP filter params. */
function facetOf(sp: SP) {
  const category = first(sp.category);
  const brand = first(sp.brand);
  const query = first(sp.q) ?? first(sp.search);
  const facet = [brand, category]
    .filter((s): s is string => Boolean(s))
    .map(cap)
    .join(" ");
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (brand) params.set("brand", brand);
  const qs = params.toString();
  const canonical = qs ? `${baseUrl}/products?${qs}` : `${baseUrl}/products`;
  return { facet, query, canonical };
}

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
  searchParams: Promise<SP>;
}): Promise<Metadata> {
  const { facet, query, canonical } = facetOf(await searchParams);
  const label = query ? `Search: ${query}` : facet || "All Products";
  const title = `${label} | ShopVerse`;
  const description = query
    ? `Search results for "${query}" on ShopVerse — filter by price, category, brand, and rating.`
    : `Shop ${facet ? facet.toLowerCase() : "thousands of products"} on ShopVerse — filter by price, category, brand, and rating, with fast fulfillment.`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, type: "website", url: canonical },
    robots: query ? { index: false, follow: true } : undefined,
  };
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { facet, query, canonical } = facetOf(await searchParams);
  // Emit Collection JSON-LD only on facet pages (not bare /products or search).
  const isCollection = Boolean(facet) && !query;

  return (
    <>
      {isCollection && (
        <CollectionPageJsonLd
          name={`${facet} | ShopVerse`}
          description={`Shop ${facet.toLowerCase()} on ShopVerse.`}
          url={canonical}
        />
      )}
      <Suspense>
        <ProductsClient />
      </Suspense>
    </>
  );
}
