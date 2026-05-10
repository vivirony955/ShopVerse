// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { SlidersHorizontal, X, ChevronLeft, ChevronRight, LayoutList, ArrowDown } from "lucide-react";
import { productsApi } from "@/lib/api";
import ProductCard from "@/components/product/ProductCard";
import ProductFilters from "@/components/product/ProductFilters";
import { ProductCardSkeleton } from "@/components/ui/Skeleton";
import type { Product, ProductFilters as IFilters } from "@/types";

const SORT_OPTIONS = [
  { label: "Newest First", sort: "createdAt", order: "desc" },
  { label: "Price: Low to High", sort: "basePrice", order: "asc" },
  { label: "Price: High to Low", sort: "basePrice", order: "desc" },
  { label: "Best Discount", sort: "discountPct", order: "desc" },
  { label: "Top Rated", sort: "rating", order: "desc" },
];

const LIMIT = 12;

function filtersFromParams(params: URLSearchParams | null): IFilters {
  if (!params) return {};
  return {
    search: params.get("search") || undefined,
    category: params.get("category") || undefined,
    brand: params.get("brand") || undefined,
    minPrice: params.get("minPrice") ? Number(params.get("minPrice")) : undefined,
    maxPrice: params.get("maxPrice") ? Number(params.get("maxPrice")) : undefined,
    size: params.get("size") || undefined,
    color: params.get("color") || undefined,
    sort: params.get("sort") || "createdAt",
    order: (params.get("order") as "asc" | "desc") || "desc",
    page: params.get("page") ? Number(params.get("page")) : 1,
    limit: LIMIT,
  };
}

export default function ProductsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [filtersOpen, setFiltersOpen] = useState(false);
  // F1-19: infinite scroll toggle
  const [infiniteMode, setInfiniteMode] = useState(false);
  const [allItems, setAllItems] = useState<Product[]>([]);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMore = useRef(false);

  const [filters, setFilters] = useState<IFilters>(() => filtersFromParams(searchParams));

  // Sync URL → filters when searchParams changes
  useEffect(() => {
    setFilters(filtersFromParams(searchParams));
    // Reset accumulated items when filters change (except page)
    setAllItems([]);
  }, [searchParams]);

  const updateUrl = useCallback(
    (newFilters: IFilters) => {
      const params = new URLSearchParams();
      Object.entries(newFilters).forEach(([k, v]) => {
        if (v !== undefined && v !== "" && k !== "limit") {
          params.set(k, String(v));
        }
      });
      router.push(`/products?${params.toString()}`, { scroll: false });
    },
    [router]
  );

  const handleFiltersChange = (f: IFilters) => {
    setFilters(f);
    updateUrl(f);
  };

  const handleSort = (sort: string, order: string) => {
    handleFiltersChange({ ...filters, sort, order: order as "asc" | "desc", page: 1 });
  };

  const { data, isLoading } = useQuery({
    queryKey: ["products", filters],
    queryFn: () => productsApi.getAll(filters),
    staleTime: 30_000,
  });

  // F1-19: accumulate items in infinite mode
  useEffect(() => {
    if (!infiniteMode || !data?.items) return;
    setAllItems((prev) => {
      const ids = new Set(prev.map((p) => p.id));
      const fresh = data.items.filter((p: Product) => !ids.has(p.id));
      return [...prev, ...fresh];
    });
    loadingMore.current = false;
  }, [data, infiniteMode]);

  // F1-19: IntersectionObserver trigger for infinite scroll
  useEffect(() => {
    if (!infiniteMode) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loadingMore.current && !isLoading) {
        const total = data?.totalPages ?? 1;
        const cur = filters.page ?? 1;
        if (cur < total) {
          loadingMore.current = true;
          setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }));
        }
      }
    }, { rootMargin: "200px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [infiniteMode, filters.page, data?.totalPages, isLoading]);

  const totalPages = data?.totalPages ?? 1;
  const currentSort = SORT_OPTIONS.find(
    (o) => o.sort === filters.sort && o.order === filters.order
  ) || SORT_OPTIONS[0];

  const title = filters.search
    ? `Results for "${filters.search}"`
    : filters.category
    ? filters.category.charAt(0).toUpperCase() + filters.category.slice(1)
    : "All Products";

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {data && (
            <p className="text-sm text-slate-500 mt-0.5">{data.total} products found</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Sort */}
          <select
            value={`${filters.sort}|${filters.order}`}
            onChange={(e) => {
              const [sort, order] = e.target.value.split("|");
              handleSort(sort, order);
            }}
            className="text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-violet-400 bg-white text-slate-700"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={`${o.sort}|${o.order}`} value={`${o.sort}|${o.order}`}>
                {o.label}
              </option>
            ))}
          </select>

          {/* Infinite scroll toggle */}
          <button
            onClick={() => {
              setInfiniteMode((m) => !m);
              setAllItems([]);
              setFilters((f) => ({ ...f, page: 1 }));
            }}
            title={infiniteMode ? "Switch to pagination" : "Enable infinite scroll"}
            className={`hidden sm:flex items-center gap-1.5 px-3 py-2 border rounded-xl text-sm font-medium transition-colors ${
              infiniteMode
                ? "border-violet-400 bg-violet-50 text-violet-600"
                : "border-slate-200 text-slate-600 hover:border-violet-300"
            }`}
          >
            {infiniteMode ? <ArrowDown className="h-4 w-4" /> : <LayoutList className="h-4 w-4" />}
            {infiniteMode ? "Scroll" : "Pages"}
          </button>

          {/* Mobile filter toggle */}
          <button
            onClick={() => setFiltersOpen(true)}
            className="lg:hidden flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:border-violet-300 hover:text-violet-600 transition-colors"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </button>
        </div>
      </div>

      <div className="flex gap-8">
        {/* Desktop Filters sidebar */}
        <aside className="hidden lg:block w-56 flex-shrink-0">
          <div className="sticky top-24">
            <ProductFilters filters={filters} onChange={handleFiltersChange} />
          </div>
        </aside>

        {/* Mobile Filters drawer */}
        <AnimatePresence>
          {filtersOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setFiltersOpen(false)}
                className="fixed inset-0 bg-black/40 z-40 lg:hidden"
              />
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="fixed left-0 top-0 bottom-0 w-72 bg-white z-50 overflow-y-auto p-5 lg:hidden"
              >
                <ProductFilters
                  filters={filters}
                  onChange={(f) => { handleFiltersChange(f); setFiltersOpen(false); }}
                  onClose={() => setFiltersOpen(false)}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Product grid */}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {Array.from({ length: LIMIT }).map((_, i) => <ProductCardSkeleton key={i} />)}
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <p className="text-5xl mb-4">🔍</p>
              <p className="text-lg font-medium text-slate-700">No products found</p>
              <p className="text-sm mt-1">Try adjusting your filters or search term</p>
              <button
                onClick={() => handleFiltersChange({ sort: "createdAt", order: "desc", page: 1, limit: LIMIT })}
                className="mt-4 px-6 py-2 bg-violet-600 text-white text-sm font-medium rounded-full hover:bg-violet-700 transition-colors"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {(infiniteMode ? allItems : data.items).map((product, i) => (
                  <ProductCard key={product.id} product={product} index={i} />
                ))}
              </div>

              {/* F1-19: Infinite scroll sentinel */}
              {infiniteMode && (
                <div ref={sentinelRef} className="py-6 flex justify-center">
                  {isLoading && (
                    <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                  )}
                  {!isLoading && (filters.page ?? 1) >= totalPages && allItems.length > 0 && (
                    <p className="text-sm text-slate-400">You've seen all products</p>
                  )}
                </div>
              )}

              {/* Pagination */}
              {!infiniteMode && totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-10">
                  <button
                    onClick={() => handleFiltersChange({ ...filters, page: (filters.page ?? 1) - 1 })}
                    disabled={(filters.page ?? 1) <= 1}
                    className="p-2 rounded-xl border border-slate-200 disabled:opacity-40 hover:border-violet-300 hover:text-violet-600 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    const page = i + 1;
                    const current = filters.page ?? 1;
                    if (totalPages > 7 && page > 3 && page < totalPages - 2 && Math.abs(page - current) > 1) {
                      return i === 3 ? <span key="ellipsis" className="px-2 text-slate-400">…</span> : null;
                    }
                    return (
                      <button
                        key={page}
                        onClick={() => handleFiltersChange({ ...filters, page })}
                        className={`w-9 h-9 rounded-xl text-sm font-medium transition-all ${
                          page === current
                            ? "bg-violet-600 text-white shadow-md shadow-violet-200"
                            : "border border-slate-200 text-slate-700 hover:border-violet-300 hover:text-violet-600"
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => handleFiltersChange({ ...filters, page: (filters.page ?? 1) + 1 })}
                    disabled={(filters.page ?? 1) >= totalPages}
                    className="p-2 rounded-xl border border-slate-200 disabled:opacity-40 hover:border-violet-300 hover:text-violet-600 transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
