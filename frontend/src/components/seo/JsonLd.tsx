// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import type { Product } from "@/types";
import { calcDiscountedPrice, STORE_CURRENCY } from "@/lib/utils";

export function ProductJsonLd({
  product,
  reviewCount,
  avgRating: avgRatingProp,
}: {
  product: Product;
  reviewCount?: number;
  avgRating?: number;
}) {
  const salePrice = calcDiscountedPrice(product.basePrice, product.discountPct);

  // F1-13: Prefer pre-computed cache fields (avgRating/reviewCount on Product) for accuracy.
  // Fall back to inline reviews array for backwards compat.
  const ratingValue =
    avgRatingProp ??
    product.avgRating ??
    (product.reviews && product.reviews.length > 0
      ? product.reviews.reduce((s, r) => s + r.rating, 0) / product.reviews.length
      : null);
  const totalReviews =
    reviewCount ??
    product.reviewCount ??
    product.reviews?.length ??
    0;

  // F1-13: AggregateOffer covers all active variants with min/max price range
  const activePrices = product.variants
    ?.filter((v) => v.stock > 0)
    .map(() => salePrice);
  const inStock = product.variants?.some((v) => v.stock > 0) ?? false;

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.images,
    sku: product.variants?.[0]?.sku,
    brand: product.brand ? { "@type": "Brand", name: product.brand.name } : undefined,
    // F1-13: AggregateOffer (multiple variants) instead of single Offer
    offers:
      activePrices && activePrices.length > 1
        ? {
            "@type": "AggregateOffer",
            priceCurrency: STORE_CURRENCY,
            lowPrice: Math.min(...activePrices).toFixed(2),
            highPrice: Math.max(...activePrices).toFixed(2),
            offerCount: activePrices.length,
            availability: "https://schema.org/InStock",
            seller: { "@type": "Organization", name: "ShopVerse" },
          }
        : {
            "@type": "Offer",
            priceCurrency: STORE_CURRENCY,
            price: salePrice.toFixed(2),
            priceValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            availability: inStock
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
            seller: { "@type": "Organization", name: "ShopVerse" },
          },
  };

  // F1-13: AggregateRating
  if (ratingValue && totalReviews > 0) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(ratingValue).toFixed(1),
      reviewCount: totalReviews,
      bestRating: "5",
      worstRating: "1",
    };
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// F1-13: FAQPage schema for product FAQs
export function FaqPageJsonLd({ faqs }: { faqs: { question: string; answer: string }[] }) {
  if (!faqs || faqs.length === 0) return null;
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function BreadcrumbJsonLd({
  items,
}: {
  items: { name: string; url: string }[];
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

/** CollectionPage schema for category / brand filter pages (helps Google
 *  understand a facet listing as a collection, not a duplicate of /products). */
export function CollectionPageJsonLd({
  name,
  description,
  url,
}: {
  name: string;
  description: string;
  url: string;
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url,
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function OrganizationJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ShopVerse",
    url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://shopverse.dev",
    logo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://shopverse.dev"}/logo.png`,
    sameAs: [],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
