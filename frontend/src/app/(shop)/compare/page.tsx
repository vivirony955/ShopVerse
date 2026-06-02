// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

"use client";
import { X, GitCompareArrows } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCompareStore } from "@/lib/store";
import { calcDiscountedPrice, formatPrice, getProductImage } from "@/lib/utils";
import Rating from "@/components/ui/Rating";

const ATTR_ROWS: { label: string; key: string }[] = [
  { label: "Brand", key: "brand" },
  { label: "Category", key: "category" },
  { label: "Base Price", key: "basePrice" },
  { label: "Discount", key: "discountPct" },
  { label: "Sale Price", key: "salePrice" },
  { label: "Rating", key: "rating" },
  { label: "Reviews", key: "reviews" },
  { label: "Variants", key: "variants" },
  { label: "Tags", key: "tags" },
];

export default function ComparePage() {
  const { products, remove, clear } = useCompareStore();

  if (products.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <GitCompareArrows className="h-14 w-14 mx-auto mb-4 text-slate-300" />
        <h1 className="text-2xl font-bold text-slate-700">No products to compare</h1>
        <p className="text-slate-500 mt-2 mb-6">
          Browse products and click the compare button to add them here.
        </p>
        <Link
          href="/products"
          className="inline-block bg-violet-600 text-white px-6 py-3 rounded-full font-semibold hover:bg-violet-700 transition-colors"
        >
          Browse Products
        </Link>
      </div>
    );
  }

  function getCellValue(key: string, product: (typeof products)[0]) {
    switch (key) {
      case "brand":
        return product.brand?.name ?? "—";
      case "category":
        return product.category?.name ?? "—";
      case "basePrice":
        return formatPrice(product.basePrice);
      case "discountPct":
        return product.discountPct > 0 ? `${product.discountPct}%` : "None";
      case "salePrice":
        return formatPrice(calcDiscountedPrice(product.basePrice, product.discountPct));
      case "rating":
        return product.reviews && product.reviews.length > 0 ? (
          <Rating
            value={product.reviews.reduce((s, r) => s + r.rating, 0) / product.reviews.length}
          />
        ) : (
          "No reviews"
        );
      case "reviews":
        return product.reviews?.length ?? 0;
      case "variants":
        return product.variants?.length ?? 0;
      case "tags":
        return product.tags?.join(", ") || "—";
      default:
        return "—";
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <GitCompareArrows className="h-7 w-7 text-violet-600" />
          <h1 className="text-2xl font-bold text-slate-900">Compare Products</h1>
          <span className="text-sm text-slate-500">({products.length}/4)</span>
        </div>
        <button
          onClick={clear}
          className="text-sm text-red-500 hover:text-red-700 font-medium transition-colors"
        >
          Clear All
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[640px]">
          {/* Product headers */}
          <thead>
            <tr>
              <th className="w-36 bg-slate-50 border border-slate-200 p-4 text-left text-sm font-semibold text-slate-600">
                Attribute
              </th>
              {products.map((p) => (
                <th key={p.id} className="border border-slate-200 bg-white p-4 min-w-[200px]">
                  <div className="relative">
                    <button
                      onClick={() => remove(p.id)}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-slate-100 hover:bg-red-100 hover:text-red-600 rounded-full flex items-center justify-center transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <div className="relative w-full aspect-square mb-3 rounded-xl overflow-hidden bg-slate-50">
                      <Image
                        src={getProductImage(p.images)}
                        alt={p.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <Link
                      href={`/products/${p.id}`}
                      className="text-sm font-semibold text-slate-800 hover:text-violet-600 transition-colors line-clamp-2"
                    >
                      {p.name}
                    </Link>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          {/* Attribute rows */}
          <tbody>
            {ATTR_ROWS.map((row) => (
              <tr key={row.key} className="hover:bg-slate-50 transition-colors">
                <td className="border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-600">
                  {row.label}
                </td>
                {products.map((p) => (
                  <td key={p.id} className="border border-slate-200 p-4 text-sm text-slate-700">
                    {getCellValue(row.key, p)}
                  </td>
                ))}
              </tr>
            ))}

            {/* CTA row */}
            <tr>
              <td className="border border-slate-200 bg-slate-50 p-4" />
              {products.map((p) => (
                <td key={p.id} className="border border-slate-200 p-4">
                  <Link
                    href={`/products/${p.id}`}
                    className="block text-center bg-violet-600 text-white text-sm font-semibold py-2.5 rounded-full hover:bg-violet-700 transition-colors"
                  >
                    View Product
                  </Link>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
