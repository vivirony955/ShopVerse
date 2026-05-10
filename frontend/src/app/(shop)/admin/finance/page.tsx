// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, TrendingUp, BarChart3, RefreshCw, Download } from "lucide-react";
import { adminApi } from "@/lib/api";
import { formatPrice, formatDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-extrabold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function AdminFinancePage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "finance-dashboard"],
    queryFn: adminApi.getFinanceDashboard,
    refetchInterval: 60_000,
  });

  const { data: revenue, isLoading: revLoading } = useQuery({
    queryKey: ["admin", "revenue-report"],
    queryFn: () => adminApi.getRevenueReport(30),
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <DollarSign className="h-7 w-7 text-emerald-600" />
          <h1 className="text-2xl font-bold text-slate-900">Finance Dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* F1-21: Export CSV */}
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/admin/export/revenue.csv?days=30`}
            download
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-emerald-600 transition-colors"
          >
            <Download className="h-4 w-4" /> Export CSV
          </a>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-violet-600 transition-colors"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Revenue report */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Revenue (last 30 days)
        </h2>
        {revLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        ) : revenue ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Revenue" value={formatPrice(revenue.totalRevenue ?? 0)} />
            <StatCard label="Orders" value={String(revenue.totalOrders ?? 0)} />
            <StatCard label="Avg Order Value" value={formatPrice(revenue.avgOrderValue ?? 0)} />
            <StatCard label="Refunds" value={formatPrice(revenue.totalRefunded ?? 0)} />
          </div>
        ) : (
          <p className="text-sm text-slate-400">No revenue data available.</p>
        )}
      </div>

      {/* Finance dashboard details */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4 flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> Finance Overview
        </h2>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        ) : data ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Object.entries(data as Record<string, unknown>)
              .filter(([, v]) => typeof v === "number")
              .map(([key, val]) => (
                <StatCard
                  key={key}
                  label={key.replace(/([A-Z])/g, " $1").trim()}
                  value={
                    key.toLowerCase().includes("amount") ||
                    key.toLowerCase().includes("revenue") ||
                    key.toLowerCase().includes("value")
                      ? formatPrice(val as number)
                      : String(val)
                  }
                />
              ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No finance data available.</p>
        )}
      </div>

      {/* Recent orders table from finance dash */}
      {data?.recentOrders && (data.recentOrders as any[]).length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Recent Transactions</h2>
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <table className="w-full min-w-[500px] text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {["Order", "Total", "Payment", "Date"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.recentOrders as any[]).slice(0, 20).map((o: any) => (
                  <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">#{o.id}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{formatPrice(o.total)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        o.paymentStatus === "PAID" ? "bg-green-100 text-green-700" :
                        o.paymentStatus === "REFUNDED" ? "bg-blue-100 text-blue-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>
                        {o.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
