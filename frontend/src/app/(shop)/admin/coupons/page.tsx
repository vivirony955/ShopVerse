// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tag, Plus, Trash2, ToggleLeft, ToggleRight, X } from "lucide-react";
import { adminCouponsApi } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatDate, formatPrice, apiErrorMessage, STORE_CURRENCY_SYMBOL } from "@/lib/utils";

interface Coupon {
  id: number;
  code: string;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: number;
  minOrderAmount: number | null;
  maxUses: number | null;
  usedCount: number;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

function CreateCouponModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    code: "", discountType: "PERCENTAGE" as "PERCENTAGE" | "FIXED",
    discountValue: 10, minOrderAmount: "", maxUses: "", expiresAt: "",
  });
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: () => adminCouponsApi.create({
      code: form.code.toUpperCase(),
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : undefined,
      maxUses: form.maxUses ? Number(form.maxUses) : undefined,
      expiresAt: form.expiresAt || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "coupons"] }); onClose(); },
    onError: (e: unknown) => setError(apiErrorMessage(e, "Failed to create coupon")),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900">Create Coupon</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        {error && <p className="text-red-600 text-sm mb-3 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Coupon Code *</label>
            <input className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm uppercase"
              value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="SAVE20" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Type *</label>
              <select className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                value={form.discountType} onChange={e => setForm(f => ({ ...f, discountType: e.target.value as "PERCENTAGE" | "FIXED" }))}>
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="FIXED">Fixed ({STORE_CURRENCY_SYMBOL})</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Value *</label>
              <input type="number" min="0" className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                value={form.discountValue} onChange={e => setForm(f => ({ ...f, discountValue: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Min Order ({STORE_CURRENCY_SYMBOL})</label>
              <input type="number" min="0" className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                value={form.minOrderAmount} onChange={e => setForm(f => ({ ...f, minOrderAmount: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Max Uses</label>
              <input type="number" min="1" className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))} placeholder="unlimited" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Expires At</label>
            <input type="datetime-local" className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
              value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={() => create.mutate()} disabled={!form.code || create.isPending}
            className="flex-1 bg-violet-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-violet-700 disabled:opacity-50">
            {create.isPending ? "Creating…" : "Create Coupon"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminCouponsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const { data: coupons = [], isLoading } = useQuery<Coupon[]>({
    queryKey: ["admin", "coupons"],
    queryFn: adminCouponsApi.getAll,
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      adminCouponsApi.update(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "coupons"] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => adminCouponsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "coupons"] }),
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {showCreate && <CreateCouponModal onClose={() => setShowCreate(false)} />}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Tag className="h-7 w-7 text-violet-600" />
          <h1 className="text-2xl font-bold text-slate-900">Coupons</h1>
          <span className="bg-violet-100 text-violet-700 text-xs font-semibold px-2.5 py-1 rounded-full">{coupons.length}</span>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-violet-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-violet-700">
          <Plus className="h-4 w-4" /> New Coupon
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
      ) : coupons.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Tag className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No coupons yet</p>
          <p className="text-sm mt-1">Create your first coupon to offer discounts</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-6 py-3">Code</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Discount</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Min Order</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Uses</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Expires</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-mono font-bold text-slate-800 text-sm bg-slate-100 px-2 py-0.5 rounded">{c.code}</span>
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-700">
                    {c.discountType === "PERCENTAGE" ? `${c.discountValue}%` : formatPrice(c.discountValue)} off
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-600">
                    {c.minOrderAmount ? formatPrice(c.minOrderAmount) : "—"}
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-600">
                    {c.usedCount}{c.maxUses ? ` / ${c.maxUses}` : ""}
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-600">
                    {c.expiresAt ? formatDate(c.expiresAt) : "Never"}
                  </td>
                  <td className="px-4 py-4">
                    <button onClick={() => toggle.mutate({ id: c.id, isActive: !c.isActive })}
                      className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${c.isActive ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                      {c.isActive ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                      {c.isActive ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <button onClick={() => { if (confirm(`Delete coupon ${c.code}?`)) remove.mutate(c.id); }}
                      className="text-slate-400 hover:text-red-500 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
