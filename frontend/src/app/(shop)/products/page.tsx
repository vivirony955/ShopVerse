// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import type { Metadata } from "next";
import ProductsClient from "./ProductsClient";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://shopverse.in';

export const metadata: Metadata = {
  title: "Shop All Products | ShopVerse",
  description:
    "Browse thousands of products across fashion, electronics, home, and more. Filter by price, category, brand, and rating.",
  alternates: {
    canonical: `${baseUrl}/products`,
  },
  openGraph: {
    title: "Shop All Products | ShopVerse",
    description: "Browse thousands of products with fast delivery across India.",
    type: "website",
  },
};

export default function ProductsPage() {
  return <ProductsClient />;
}
