// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, AlertTriangle, X, Check, Search } from "lucide-react";
import { adminApi, adminWarehouseApi } from "@/lib/api";
import { apiErrorMessage } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";

interface LowStockItem {
  id: number;
  sku: string;
  size: string | null;
  color: string | null;
  stock: number;
  reservedStock: number;
  product?: { id: number; name: string };
}

interface AdjustModalProps {
  item: LowStockItem;
  warehouses: { id: number; name: string }[];
  onClose: () => void;
}

function AdjustInventoryModal({ item, warehouses, onClose }: AdjustModalProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    warehouseId: warehouses[0]?.id ?? 0,
    stock: item.stock,
    reorderPoint: 5,
  });
  const [error, setError] = useState("");

  const adjust = useMutation({
    mutationFn: () =>
      adminWarehouseApi.updateInventory({
        warehouseId: Number(form.warehouseId),
        variantId: item.id,
        stock: Number(form.stock),
        reorderPoint: Number(form.reorderPoint),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "low-stock"] });
      qc.invalidateQueries({ queryKey: ["admin", "out-of-stock"] });
      onClose();
    },
    onError: (e: unknown) => setError(apiErrorMessage(e, "Failed to update inventory")),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900">Adjust Inventory</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <div className="bg-slate-50 rounded-xl px-4 py-3 mb-5">
          <p className="text-sm font-semibold text-slate-800">{item.product?.name ?? "Unknown Product"}</p>
          <p className="text-xs text-slate-500 font-mono mt-0.5">SKU: {item.sku}{item.size ? ` · ${item.size}` : ""}{item.color ? ` · ${item.color}` : ""}</p>
          <p className="text-xs text-slate-500 mt-1">Current stock: <span className={`font-bold ${item.stock === 0 ? "text-red-600" : item.stock <= 5 ? "text-orange-600" : "text-slate-800"}`}>{item.stock}</span> · Reserved: {item.reservedStock}</p>
        </div>
        {error && <p className="text-red-600 text-sm mb-3 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Warehouse *</label>
            <select className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
              value={form.warehouseId}
              onChange={e => setForm(f => ({ ...f, warehouseId: Number(e.target.value) }))}>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">New Stock *</label>
            <input type="number" min="0" className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
              value={form.stock} onChange={e => setForm(f => ({ ...f, stock: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Reorder Point</label>
            <input type="number" min="0" className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
              value={form.reorderPoint} onChange={e => setForm(f => ({ ...f, reorderPoint: Number(e.target.value) }))} />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={() => adjust.mutate()} disabled={adjust.isPending || !form.warehouseId}
            className="flex-1 bg-violet-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {adjust.isPending ? "Saving…" : <><Check className="h-4 w-4" /> Update Stock</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminInventoryPage() {
  const [tab, setTab] = useState<"low" | "out">("low");
  const [threshold, setThreshold] = useState(10);
  const [adjusting, setAdjusting] = useState<LowStockItem | null>(null);
  const [search, setSearch] = useState("");

  const { data: lowStock = [], isLoading: loadingLow } = useQuery<LowStockItem[]>({
    queryKey: ["admin", "low-stock", threshold],
    queryFn: () => adminApi.getLowStock(threshold),
  });

  const { data: outOfStock = [], isLoading: loadingOut } = useQuery<LowStockItem[]>({
    queryKey: ["admin", "out-of-stock"],
    queryFn: adminApi.getOutOfStock,
    enabled: tab === "out",
  });

  const { data: warehouses = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["admin", "warehouses-list"],
    queryFn: adminWarehouseApi.list,
  });

  const items = tab === "low" ? lowStock : outOfStock;
  const isLoading = tab === "low" ? loadingLow : loadingOut;

  const filtered = search
    ? items.filter(i =>
        i.sku.toLowerCase().includes(search.toLowerCase()) ||
        i.product?.name.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {adjusting && warehouses.length > 0 && (
        <AdjustInventoryModal
          item={adjusting}
          warehouses={warehouses}
          onClose={() => setAdjusting(null)}
        />
      )}

      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Package className="h-7 w-7 text-orange-500" />
          <h1 className="text-2xl font-bold text-slate-900">Inventory Monitor</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab("low")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === "low" ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
          <AlertTriangle className="h-3.5 w-3.5 inline mr-1.5" />
          Low Stock {!loadingLow && <span className="ml-1 bg-orange-200 text-orange-800 text-xs px-1.5 py-0.5 rounded-full">{lowStock.length}</span>}
        </button>
        <button
          onClick={() => setTab("out")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === "out" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
          <Package className="h-3.5 w-3.5 inline mr-1.5" />
          Out of Stock {!loadingOut && tab === "out" && <span className="ml-1 bg-red-200 text-red-800 text-xs px-1.5 py-0.5 rounded-full">{outOfStock.length}</span>}
        </button>
      </div>

      {/* Controls */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm"
            placeholder="Search SKU or product…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {tab === "low" && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-500">Threshold:</label>
            <input type="number" min="1" max="100"
              className="w-20 border border-slate-200 rounded-xl px-3 py-2 text-sm"
              value={threshold}
              onChange={e => setThreshold(Number(e.target.value))} />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{tab === "low" ? "No low-stock items" : "No out-of-stock items"}</p>
          {tab === "low" && <p className="text-sm mt-1">All variants are above the {threshold}-unit threshold</p>}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-6 py-3">Variant</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">SKU</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Stock</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Reserved</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Available</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const available = item.stock - item.reservedStock;
                return (
                  <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-slate-800 text-sm">{item.product?.name ?? "—"}</p>
                      <p className="text-xs text-slate-400">{[item.size, item.color].filter(Boolean).join(" · ") || "Default"}</p>
                    </td>
                    <td className="px-4 py-4 text-xs font-mono text-slate-600">{item.sku}</td>
                    <td className="px-4 py-4">
                      <span className={`text-sm font-bold ${item.stock === 0 ? "text-red-600" : item.stock <= 5 ? "text-orange-600" : "text-amber-600"}`}>
                        {item.stock}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-500">{item.reservedStock}</td>
                    <td className="px-4 py-4">
                      <span className={`text-sm font-semibold ${available <= 0 ? "text-red-600" : available <= 3 ? "text-orange-600" : "text-slate-700"}`}>
                        {available}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => setAdjusting(item)}
                        className="text-xs font-medium bg-violet-50 text-violet-700 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition-colors">
                        Adjust
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
