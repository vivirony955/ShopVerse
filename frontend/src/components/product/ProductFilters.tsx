// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

"use client";
import { useQuery } from "@tanstack/react-query";
import { X, ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { categoriesApi, brandsApi } from "@/lib/api";
import type { ProductFilters } from "@/types";

const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "28", "30", "32", "34", "36", "38", "40", "42"];
const COLORS = ["Black", "White", "Red", "Blue", "Green", "Yellow", "Pink", "Purple", "Grey", "Brown", "Navy", "Beige"];
const PRICE_RANGES = [
  { label: "Under ₹500", min: 0, max: 500 },
  { label: "₹500 – ₹1,000", min: 500, max: 1000 },
  { label: "₹1,000 – ₹2,000", min: 1000, max: 2000 },
  { label: "₹2,000 – ₹5,000", min: 2000, max: 5000 },
  { label: "Above ₹5,000", min: 5000, max: undefined },
];

interface Props {
  filters: ProductFilters;
  onChange: (filters: ProductFilters) => void;
  onClose?: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-slate-100 py-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full text-sm font-semibold text-slate-900 mb-3"
      >
        {title}
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {open && children}
    </div>
  );
}

export default function ProductFilters({ filters, onChange, onClose }: Props) {
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: categoriesApi.getAll, staleTime: 5 * 60 * 1000 });
  const { data: brands } = useQuery({ queryKey: ["brands"], queryFn: brandsApi.getAll, staleTime: 5 * 60 * 1000 });

  const set = <K extends keyof ProductFilters>(key: K, value: ProductFilters[K]) =>
    onChange({ ...filters, [key]: value, page: 1 });

  const clearAll = () => onChange({ page: 1 });

  const hasFilters = !!(
    filters.category || filters.brand || filters.minPrice !== undefined ||
    filters.maxPrice !== undefined || filters.size || filters.color
  );

  return (
    <aside className="w-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-violet-600" />
          <span className="font-bold text-slate-900">Filters</span>
          {hasFilters && (
            <button
              onClick={clearAll}
              className="text-xs text-rose-500 hover:underline ml-1"
            >
              Clear all
            </button>
          )}
        </div>
        {onClose && (
          <button onClick={onClose} className="lg:hidden p-1 rounded-lg hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Category */}
      <Section title="Category">
        <div className="space-y-1.5">
          {categories?.map((cat) => (
            <label key={cat.id} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="radio"
                name="category"
                checked={filters.category === cat.slug}
                onChange={() => set("category", filters.category === cat.slug ? undefined : cat.slug)}
                className="accent-violet-600"
              />
              <span className="text-sm text-slate-600 group-hover:text-violet-600 transition-colors">{cat.name}</span>
            </label>
          ))}
        </div>
      </Section>

      {/* Brand */}
      <Section title="Brand">
        <div className="space-y-1.5 max-h-48 overflow-y-auto no-scrollbar">
          {brands?.map((brand) => (
            <label key={brand.id} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={filters.brand === brand.slug}
                onChange={() => set("brand", filters.brand === brand.slug ? undefined : brand.slug)}
                className="accent-violet-600 rounded"
              />
              <span className="text-sm text-slate-600 group-hover:text-violet-600 transition-colors">{brand.name}</span>
            </label>
          ))}
        </div>
      </Section>

      {/* Price */}
      <Section title="Price Range">
        <div className="space-y-1.5">
          {PRICE_RANGES.map((range) => (
            <label key={range.label} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="radio"
                name="price"
                checked={filters.minPrice === range.min && filters.maxPrice === range.max}
                onChange={() =>
                  onChange({ ...filters, minPrice: range.min, maxPrice: range.max, page: 1 })
                }
                className="accent-violet-600"
              />
              <span className="text-sm text-slate-600 group-hover:text-violet-600 transition-colors">{range.label}</span>
            </label>
          ))}
        </div>
      </Section>

      {/* Size */}
      <Section title="Size">
        <div className="flex flex-wrap gap-2">
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => set("size", filters.size === s ? undefined : s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                filters.size === s
                  ? "bg-violet-600 text-white border-violet-600"
                  : "border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-600"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </Section>

      {/* Color */}
      <Section title="Color">
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => set("color", filters.color === c ? undefined : c)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                filters.color === c
                  ? "bg-violet-600 text-white border-violet-600"
                  : "border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-600"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </Section>
    </aside>
  );
}
