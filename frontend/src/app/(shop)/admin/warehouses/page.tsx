// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Warehouse, Plus, X, Check, ChevronDown, ChevronUp, Package } from "lucide-react";
import { adminWarehouseApi } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";

interface WarehouseItem {
  id: number;
  name: string;
  city: string;
  pincode: string;
  address: string | null;
  isActive: boolean;
  _count?: { inventory: number };
}

function CreateWarehouseModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", city: "", pincode: "", address: "" });
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: () =>
      adminWarehouseApi.create({
        name: form.name,
        city: form.city,
        pincode: form.pincode,
        address: form.address || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "warehouses"] });
      onClose();
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? "Failed to create warehouse"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900">Add Warehouse</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        {error && <p className="text-red-600 text-sm mb-3 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Name *</label>
            <input className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Mumbai Hub" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">City *</label>
              <input className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                placeholder="Mumbai" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pincode *</label>
              <input className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono"
                value={form.pincode} onChange={e => setForm(f => ({ ...f, pincode: e.target.value }))}
                placeholder="400001" maxLength={6} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Address</label>
            <textarea className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none" rows={2}
              value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              placeholder="Full street address…" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={() => create.mutate()} disabled={!form.name || !form.city || !form.pincode || create.isPending}
            className="flex-1 bg-violet-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {create.isPending ? "Creating…" : <><Check className="h-4 w-4" /> Create</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function WarehouseCard({ wh }: { wh: WarehouseItem }) {
  const [expanded, setExpanded] = useState(false);
  const { data: detail, isLoading } = useQuery({
    queryKey: ["admin", "warehouse", wh.id],
    queryFn: () => adminWarehouseApi.get(wh.id),
    enabled: expanded,
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
              <Warehouse className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900">{wh.name}</h3>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${wh.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                  {wh.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">{wh.city} · {wh.pincode}</p>
              {wh.address && <p className="text-xs text-slate-400 mt-0.5">{wh.address}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-2xl font-extrabold text-slate-900">{wh._count?.inventory ?? "—"}</p>
              <p className="text-xs text-slate-400">SKUs tracked</p>
            </div>
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-slate-400 hover:text-slate-700 transition-colors p-1">
              {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Package className="h-3.5 w-3.5" /> Inventory Snapshot
          </h4>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-lg" />)}</div>
          ) : !detail?.inventory?.length ? (
            <p className="text-sm text-slate-400 py-3 text-center">No inventory records for this warehouse</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-400 pb-2">SKU</th>
                    <th className="text-left text-xs font-semibold text-slate-400 pb-2">Product</th>
                    <th className="text-right text-xs font-semibold text-slate-400 pb-2">Stock</th>
                    <th className="text-right text-xs font-semibold text-slate-400 pb-2">Reserved</th>
                    <th className="text-right text-xs font-semibold text-slate-400 pb-2">Available</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.inventory.slice(0, 10).map((inv: any) => (
                    <tr key={inv.id} className="border-b border-slate-50">
                      <td className="py-2 font-mono text-xs text-slate-600">{inv.variant?.sku ?? "—"}</td>
                      <td className="py-2 text-slate-700 truncate max-w-[160px]">{inv.variant?.product?.name ?? "—"}</td>
                      <td className="py-2 text-right font-semibold text-slate-800">{inv.stock}</td>
                      <td className="py-2 text-right text-slate-500">{inv.reserved}</td>
                      <td className="py-2 text-right">
                        <span className={`font-semibold ${inv.stock - inv.reserved <= 0 ? "text-red-600" : inv.stock - inv.reserved <= 5 ? "text-orange-600" : "text-green-700"}`}>
                          {inv.stock - inv.reserved}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {detail.inventory.length > 10 && (
                <p className="text-xs text-slate-400 text-center mt-3">Showing 10 of {detail.inventory.length} SKUs</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminWarehousesPage() {
  const [showCreate, setShowCreate] = useState(false);
  const { data: warehouses = [], isLoading } = useQuery<WarehouseItem[]>({
    queryKey: ["admin", "warehouses"],
    queryFn: adminWarehouseApi.list,
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {showCreate && <CreateWarehouseModal onClose={() => setShowCreate(false)} />}

      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Warehouse className="h-7 w-7 text-violet-600" />
          <h1 className="text-2xl font-bold text-slate-900">Warehouses</h1>
          <span className="bg-violet-100 text-violet-700 text-xs font-semibold px-2.5 py-1 rounded-full">{warehouses.length}</span>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-violet-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-violet-700">
          <Plus className="h-4 w-4" /> Add Warehouse
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : warehouses.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Warehouse className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No warehouses configured</p>
          <p className="text-sm mt-1">Add your first fulfillment warehouse</p>
        </div>
      ) : (
        <div className="space-y-4">
          {warehouses.map(wh => (
            <WarehouseCard key={wh.id} wh={wh} />
          ))}
        </div>
      )}
    </div>
  );
}
