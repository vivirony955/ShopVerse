// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ShoppingCart, Search, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Order } from "@/types";

const STATUSES = [
  "ALL", "PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED",
  "CANCELLED", "RETURN_REQUESTED", "RETURNED", "REFUNDED",
];

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  PROCESSING: "bg-indigo-100 text-indigo-700",
  SHIPPED: "bg-cyan-100 text-cyan-700",
  DELIVERED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-600",
  RETURN_REQUESTED: "bg-orange-100 text-orange-700",
  RETURNED: "bg-slate-100 text-slate-600",
  REFUNDED: "bg-purple-100 text-purple-700",
};

export default function AdminOrdersPage() {
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "orders", statusFilter],
    queryFn: () =>
      adminApi.getOrders(statusFilter !== "ALL" ? { status: statusFilter, limit: 50 } : { limit: 50 }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      adminApi.updateOrderStatus(id, status),
    onSuccess: () => {
      toast.success("Order status updated");
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      setEditingId(null);
    },
    onError: () => toast.error("Failed to update status"),
  });

  const orders: Order[] = data ?? [];
  const filtered = search
    ? orders.filter(
        (o) =>
          String(o.id).includes(search) ||
          (o as any).user?.email?.toLowerCase().includes(search.toLowerCase())
      )
    : orders;

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <ShoppingCart className="h-7 w-7 text-violet-600" />
        <h1 className="text-2xl font-bold text-slate-900">Order Management</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by order ID or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                statusFilter === s
                  ? "bg-violet-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-violet-100 hover:text-violet-700"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {["Order ID", "Customer", "Total", "Payment", "Status", "Date", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 rounded w-20" />
                      </td>
                    ))}
                  </tr>
                ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400 text-sm">
                    No orders found
                  </td>
                </tr>
              )}
              {filtered.map((order) => (
                <tr key={order.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-semibold text-slate-800">#{order.id}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {(order as any).user?.email ?? order.guestEmail ?? "Guest"}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">
                    ₹{order.total.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{order.paymentMethod}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === order.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          defaultValue={order.status}
                          onChange={(e) =>
                            statusMutation.mutate({ id: order.id, status: e.target.value })
                          }
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-violet-500"
                        >
                          {STATUSES.filter((s) => s !== "ALL").map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs text-slate-400 hover:text-slate-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingId(order.id)}
                        className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 font-medium"
                      >
                        Edit <ChevronDown className="h-3 w-3" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
