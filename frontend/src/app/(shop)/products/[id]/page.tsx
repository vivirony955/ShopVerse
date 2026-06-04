// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import type { Metadata } from "next";
import ProductDetailClient from "./ProductDetailClient";
import { SERVER_API_BASE } from "@/lib/server-api";

// SSR metadata fetch runs in the Next server process → server-reachable URL
// (includes the /api prefix). Browser hydration uses NEXT_PUBLIC_API_URL.
const API_URL = SERVER_API_BASE;
const STORE_CURRENCY = process.env.NEXT_PUBLIC_STORE_CURRENCY ?? "USD";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://shopverse.dev";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_URL}/products/${id}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return { title: "Product | ShopVerse" };
    const product = await res.json();
    const salePrice = product.basePrice * (1 - product.discountPct / 100);
    const description = product.description?.slice(0, 160) ?? "";
    // OG/Twitter images come from the dynamic opengraph-image.tsx in this
    // segment (branded card with name + store-currency price), so they are
    // intentionally not set here.
    return {
      title: `${product.name} | ShopVerse`,
      description,
      alternates: {
        canonical: `${SITE_URL}/products/${id}`,
      },
      openGraph: {
        title: product.name,
        description,
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title: product.name,
        description,
      },
      other: {
        "product:price:amount": salePrice.toFixed(2),
        "product:price:currency": STORE_CURRENCY,
      },
    };
  } catch {
    return { title: "Product | ShopVerse" };
  }
}

export default function ProductPage() {
  return <ProductDetailClient />;
}
