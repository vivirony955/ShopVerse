// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layers, Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { adminCategoriesApi } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";

interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  _count?: { products: number };
}

function CategoryRow({ cat, onEdit, onDelete }: { cat: Category; onEdit: (c: Category) => void; onDelete: (id: number) => void }) {
  return (
    <tr className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
      <td className="px-6 py-4 flex items-center gap-3">
        {cat.imageUrl ? (
          <img src={cat.imageUrl} alt={cat.name} className="w-8 h-8 rounded-lg object-cover border border-slate-100" />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 text-xs font-bold">
            {cat.name[0]}
          </div>
        )}
        <div>
          <p className="font-semibold text-slate-800 text-sm">{cat.name}</p>
          <p className="text-xs text-slate-400 font-mono">{cat.slug}</p>
        </div>
      </td>
      <td className="px-4 py-4 text-sm text-slate-600 max-w-xs truncate">{cat.description ?? "—"}</td>
      <td className="px-4 py-4 text-sm text-slate-500">{cat._count?.products ?? "—"} products</td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <button onClick={() => onEdit(cat)} className="text-slate-400 hover:text-violet-600 transition-colors"><Pencil className="h-4 w-4" /></button>
          <button onClick={() => { if (confirm(`Delete category "${cat.name}"?`)) onDelete(cat.id); }}
            className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="h-4 w-4" /></button>
        </div>
      </td>
    </tr>
  );
}

function CategoryModal({ cat, onClose }: { cat?: Category; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: cat?.name ?? "", slug: cat?.slug ?? "",
    description: cat?.description ?? "", imageUrl: cat?.imageUrl ?? "",
  });
  const [error, setError] = useState("");

  const autoSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const save = useMutation({
    mutationFn: () => cat
      ? adminCategoriesApi.update(cat.id, form)
      : adminCategoriesApi.create({ ...form, description: form.description || undefined, imageUrl: form.imageUrl || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "categories"] }); onClose(); },
    onError: (e: any) => setError(e?.response?.data?.message ?? "Failed to save category"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900">{cat ? "Edit Category" : "Create Category"}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        {error && <p className="text-red-600 text-sm mb-3 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Name *</label>
            <input className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
              value={form.name} onChange={e => {
                const n = e.target.value;
                setForm(f => ({ ...f, name: n, slug: cat ? f.slug : autoSlug(n) }));
              }} placeholder="Women's Clothing" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Slug *</label>
            <input className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono"
              value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</label>
            <textarea className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none" rows={3}
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Image URL</label>
            <input className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
              value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} placeholder="https://..." />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={() => save.mutate()} disabled={!form.name || !form.slug || save.isPending}
            className="flex-1 bg-violet-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {save.isPending ? "Saving…" : <><Check className="h-4 w-4" /> Save</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminCategoriesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Category | null | "new">(null);
  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ["admin", "categories"],
    queryFn: adminCategoriesApi.getAll,
  });

  const remove = useMutation({
    mutationFn: (id: number) => adminCategoriesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "categories"] }),
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {editing !== null && (
        <CategoryModal
          cat={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Layers className="h-7 w-7 text-blue-600" />
          <h1 className="text-2xl font-bold text-slate-900">Categories</h1>
          <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full">{categories.length}</span>
        </div>
        <button onClick={() => setEditing("new")}
          className="flex items-center gap-2 bg-violet-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-violet-700">
          <Plus className="h-4 w-4" /> New Category
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>
      ) : categories.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Layers className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No categories yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-6 py-3">Category</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Description</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Products</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <CategoryRow key={cat.id} cat={cat} onEdit={setEditing} onDelete={(id) => remove.mutate(id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
