// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import type { Metadata } from "next";
import ProductDetailClient from "./ProductDetailClient";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  try {
    const res = await fetch(`${API_URL}/products/${params.id}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return { title: "Product | ShopVerse" };
    const product = await res.json();
    const salePrice = product.basePrice * (1 - product.discountPct / 100);
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://shopverse.in';
    const description = product.description?.slice(0, 160) ?? "";
    return {
      title: `${product.name} | ShopVerse`,
      description,
      alternates: {
        canonical: `${baseUrl}/products/${params.id}`,
      },
      openGraph: {
        title: product.name,
        description,
        images: product.images?.[0] ? [{ url: product.images[0] }] : [],
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title: product.name,
        description,
        images: product.images?.[0] ? [product.images[0]] : [],
      },
      other: {
        "product:price:amount": salePrice.toFixed(2),
        "product:price:currency": "INR",
      },
    };
  } catch {
    return { title: "Product | ShopVerse" };
  }
}

export default function ProductPage() {
  return <ProductDetailClient />;
}
