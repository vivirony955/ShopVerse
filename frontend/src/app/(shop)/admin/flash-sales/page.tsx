// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Zap, Plus, Trash2, X, Package } from "lucide-react";
import { adminFlashSalesApi } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatDate, apiErrorMessage } from "@/lib/utils";

interface FlashSaleItem {
  id: number;
  title: string;
  slug: string;
  discountPct: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  flashSaleItems?: { id: number; product?: { id: number; name: string } }[];
}

function CreateFlashSaleModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", slug: "", discountPct: 20, startsAt: "", endsAt: "" });
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: () => adminFlashSalesApi.create({
      ...form,
      discountPct: Number(form.discountPct),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "flash-sales"] }); onClose(); },
    onError: (e: unknown) => setError(apiErrorMessage(e, "Failed to create flash sale")),
  });

  const autoSlug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900">Create Flash Sale</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        {error && <p className="text-red-600 text-sm mb-3 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Title *</label>
            <input className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
              value={form.title} onChange={e => {
                const t = e.target.value;
                setForm(f => ({ ...f, title: t, slug: autoSlug(t) }));
              }} placeholder="Summer Flash Sale" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Slug *</label>
            <input className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono"
              value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Discount % *</label>
            <input type="number" min="1" max="90" className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
              value={form.discountPct} onChange={e => setForm(f => ({ ...f, discountPct: Number(e.target.value) }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Starts At *</label>
              <input type="datetime-local" className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                value={form.startsAt} onChange={e => setForm(f => ({ ...f, startsAt: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Ends At *</label>
              <input type="datetime-local" className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                value={form.endsAt} onChange={e => setForm(f => ({ ...f, endsAt: e.target.value }))} />
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={() => create.mutate()} disabled={!form.title || !form.slug || !form.startsAt || !form.endsAt || create.isPending}
            className="flex-1 bg-violet-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-violet-700 disabled:opacity-50">
            {create.isPending ? "Creating…" : "Create Flash Sale"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ sale }: { sale: FlashSaleItem }) {
  const now = new Date();
  const start = new Date(sale.startsAt);
  const end = new Date(sale.endsAt);
  if (!sale.isActive) return <span className="text-xs font-semibold bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full">Inactive</span>;
  if (now < start) return <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">Scheduled</span>;
  if (now > end) return <span className="text-xs font-semibold bg-red-100 text-red-600 px-2.5 py-1 rounded-full">Ended</span>;
  return <span className="text-xs font-semibold bg-green-100 text-green-700 px-2.5 py-1 rounded-full">Live</span>;
}

export default function AdminFlashSalesPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const { data: sales = [], isLoading } = useQuery<FlashSaleItem[]>({
    queryKey: ["admin", "flash-sales"],
    queryFn: adminFlashSalesApi.getAll,
  });

  const remove = useMutation({
    mutationFn: (id: number) => adminFlashSalesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "flash-sales"] }),
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {showCreate && <CreateFlashSaleModal onClose={() => setShowCreate(false)} />}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Zap className="h-7 w-7 text-amber-500" />
          <h1 className="text-2xl font-bold text-slate-900">Flash Sales</h1>
          <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full">{sales.length}</span>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-violet-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-violet-700">
          <Plus className="h-4 w-4" /> New Flash Sale
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : sales.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Zap className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No flash sales yet</p>
          <p className="text-sm mt-1">Create a flash sale to offer limited-time discounts</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sales.map((sale) => (
            <div key={sale.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-bold text-slate-900">{sale.title}</h3>
                    <StatusBadge sale={sale} />
                    <span className="text-xs font-semibold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{sale.discountPct}% OFF</span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">/{sale.slug}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                    <span>Starts: {formatDate(sale.startsAt)}</span>
                    <span>Ends: {formatDate(sale.endsAt)}</span>
                    <span className="flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      {sale.flashSaleItems?.length ?? 0} products
                    </span>
                  </div>
                </div>
                <button onClick={() => { if (confirm(`Delete "${sale.title}"?`)) remove.mutate(sale.id); }}
                  className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
