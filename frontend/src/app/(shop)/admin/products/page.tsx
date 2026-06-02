// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Package, Search, Plus, Trash2, Edit2, X, Check } from "lucide-react";
import Image from "next/image";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { calcDiscountedPrice, formatPrice, getProductImage } from "@/lib/utils";
import type { Product } from "@/types";

export default function AdminProductsPage() {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<{ discountPct?: number; isActive?: boolean }>({});
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "products"],
    queryFn: () => adminApi.getProducts({ limit: 100 }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      adminApi.updateProduct(id, data),
    onSuccess: () => {
      toast.success("Product updated");
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      setEditingId(null);
      setEditData({});
    },
    onError: () => toast.error("Failed to update product"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.deleteProduct(id),
    onSuccess: () => {
      toast.success("Product deleted");
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
    },
    onError: () => toast.error("Failed to delete product"),
  });

  const products: Product[] = Array.isArray(data) ? data : data?.items ?? [];
  const filtered = search
    ? products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : products;

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Package className="h-7 w-7 text-violet-600" />
          <h1 className="text-2xl font-bold text-slate-900">Product Management</h1>
        </div>
        <button className="flex items-center gap-2 bg-violet-600 text-white px-4 py-2.5 rounded-full text-sm font-semibold hover:bg-violet-700 transition-colors">
          <Plus className="h-4 w-4" /> Add Product
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {["Product", "Category", "Price", "Discount", "Stock", "Active", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 rounded w-24" />
                      </td>
                    ))}
                  </tr>
                ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400 text-sm">
                    No products found
                  </td>
                </tr>
              )}
              {filtered.map((product) => {
                const totalStock = product.variants?.reduce((s, v) => s + v.stock, 0) ?? 0;
                const isEditing = editingId === product.id;
                return (
                  <tr key={product.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0">
                          <Image
                            src={getProductImage(product.images)}
                            alt={product.name}
                            fill
                            className="object-cover"
                          />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800 line-clamp-1">{product.name}</p>
                          <p className="text-xs text-slate-400">ID: {product.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{product.category?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">
                      {formatPrice(calcDiscountedPrice(product.basePrice, product.discountPct))}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={product.discountPct}
                          onChange={(e) => setEditData((d) => ({ ...d, discountPct: Number(e.target.value) }))}
                          className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      ) : (
                        <span className={`text-sm ${product.discountPct > 0 ? "text-rose-500 font-medium" : "text-slate-400"}`}>
                          {product.discountPct > 0 ? `${product.discountPct}%` : "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-medium ${totalStock <= 5 ? "text-orange-500" : "text-slate-700"}`}>
                        {totalStock}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="checkbox"
                          defaultChecked={product.isActive}
                          onChange={(e) => setEditData((d) => ({ ...d, isActive: e.target.checked }))}
                          className="w-4 h-4 accent-violet-600"
                        />
                      ) : (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${product.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                          {product.isActive ? "Active" : "Inactive"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateMutation.mutate({ id: product.id, data: editData })}
                            disabled={updateMutation.isPending}
                            className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setEditData({}); }}
                            className="p-1.5 bg-slate-50 text-slate-500 rounded-lg hover:bg-slate-100 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditingId(product.id)}
                            className="p-1.5 bg-violet-50 text-violet-600 rounded-lg hover:bg-violet-100 transition-colors"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete "${product.name}"?`)) deleteMutation.mutate(product.id);
                            }}
                            className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
