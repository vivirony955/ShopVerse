// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { adminApi, categoriesApi, brandsApi } from "@/lib/api";
import { apiErrorMessage } from "@/lib/utils";
import type { Product, ProductsResponse, Variant as ProductVariant } from "@/types";
import toast from "react-hot-toast";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

type Variant = { id?: number; size: string; color: string; stock: number };

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const productId = parseInt(params?.id ?? "0");

  const [form, setForm] = useState({
    name: "", description: "", basePrice: "", discountPct: "0",
    categoryId: "", brandId: "", images: "",
  });
  const [variants, setVariants] = useState<Variant[]>([]);
  const [ready, setReady] = useState(false);

  const { data: product, isLoading } = useQuery({
    queryKey: ["admin-product", productId],
    queryFn: () =>
      adminApi.getProducts({ id: productId }).then((d: ProductsResponse | Product[]) => {
        const items: Product[] = Array.isArray(d) ? d : d.items ?? [];
        return items.find((p) => p.id === productId) ?? null;
      }),
  });

  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: categoriesApi.getAll });
  const { data: brands = [] } = useQuery({ queryKey: ["brands"], queryFn: brandsApi.getAll });

  useEffect(() => {
    if (product && !ready) {
      setForm({
        name: product.name ?? "",
        description: product.description ?? "",
        basePrice: String(product.basePrice ?? ""),
        discountPct: String(product.discountPct ?? "0"),
        categoryId: String(product.categoryId ?? ""),
        brandId: String(product.brandId ?? ""),
        images: (product.images ?? []).join("\n"),
      });
      setVariants((product.variants ?? []).map((v: ProductVariant) => ({
        id: v.id,
        size: v.size ?? "",
        color: v.color ?? "",
        stock: v.stock ?? 0,
      })));
      setReady(true);
    }
  }, [product, ready]);

  const updateMutation = useMutation({
    mutationFn: () =>
      adminApi.updateProduct(productId, {
        name: form.name,
        description: form.description,
        basePrice: parseFloat(form.basePrice),
        discountPct: parseFloat(form.discountPct) || 0,
        categoryId: parseInt(form.categoryId),
        brandId: form.brandId ? parseInt(form.brandId) : undefined,
        images: form.images ? form.images.split("\n").map((s) => s.trim()).filter(Boolean) : [],
        variants: variants.map((v) => ({
          ...(v.id ? { id: v.id } : {}),
          size: v.size,
          color: v.color,
          stock: Number(v.stock),
        })),
      }),
    onSuccess: () => {
      toast.success("Product updated");
      router.push("/admin/products");
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, "Failed to update product")),
  });

  const field = (key: keyof typeof form, label: string, type = "text", required = false) => (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}{required && " *"}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        required={required}
        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
      />
    </div>
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/products" className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ArrowLeft className="h-4 w-4 text-slate-500" />
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Edit Product</h1>
        {product && <span className="text-sm text-slate-400">#{product.id}</span>}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
              <h2 className="font-semibold text-slate-900">Basic Information</h2>
              {field("name", "Product Name", "text", true)}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Image URLs (one per line)</label>
                <textarea
                  value={form.images}
                  onChange={(e) => setForm((f) => ({ ...f, images: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 resize-none font-mono"
                />
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-5">
              <h2 className="font-semibold text-slate-900 mb-4">Pricing</h2>
              <div className="grid grid-cols-2 gap-4">
                {field("basePrice", "Base Price (₹)", "number", true)}
                {field("discountPct", "Discount %", "number")}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-900">Variants</h2>
                <button
                  type="button"
                  onClick={() => setVariants((v) => [...v, { size: "", color: "", stock: 0 }])}
                  className="flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-700"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Variant
                </button>
              </div>
              <div className="space-y-3">
                {variants.map((v, i) => (
                  <div key={i} className="grid grid-cols-4 gap-2 items-end">
                    {(["size", "color"] as const).map((k) => (
                      <div key={k}>
                        <label className="block text-xs text-slate-500 mb-1 capitalize">{k}</label>
                        <input
                          value={v[k]}
                          onChange={(e) => setVariants((arr) => arr.map((x, j) => j === i ? { ...x, [k]: e.target.value } : x))}
                          className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-violet-400"
                        />
                      </div>
                    ))}
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Stock</label>
                      <input
                        type="number"
                        value={v.stock}
                        min={0}
                        onChange={(e) => setVariants((arr) => arr.map((x, j) => j === i ? { ...x, stock: parseInt(e.target.value) || 0 } : x))}
                        className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-violet-400"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setVariants((arr) => arr.filter((_, j) => j !== i))}
                      disabled={variants.length === 1}
                      className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
              <h2 className="font-semibold text-slate-900">Organization</h2>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Category *</label>
                <select
                  value={form.categoryId}
                  onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 bg-white"
                >
                  <option value="">Select category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Brand</label>
                <select
                  value={form.brandId}
                  onChange={(e) => setForm((f) => ({ ...f, brandId: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 bg-white"
                >
                  <option value="">No brand</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-semibold rounded-2xl transition-colors"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </button>
            <Link
              href="/admin/products"
              className="block text-center text-sm text-slate-500 hover:text-slate-700"
            >
              Cancel
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
