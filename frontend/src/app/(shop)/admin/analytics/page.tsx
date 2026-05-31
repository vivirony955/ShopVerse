// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BarChart3, Users, TrendingUp, RefreshCw } from "lucide-react";
import { adminApi } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";

const FUNNEL_DAYS_OPTIONS = [7, 14, 30];

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [funnelDays, setFunnelDays] = useState(7);

  const { data: customerData, isLoading: custLoading } = useQuery({
    queryKey: ["admin", "customer-analytics"],
    queryFn: adminApi.getCustomerAnalytics,
  });

  const { data: funnelData, isLoading: funnelLoading } = useQuery({
    queryKey: ["admin", "funnel", funnelDays],
    queryFn: () => adminApi.getFunnelAnalytics(funnelDays),
  });

  const { data: liveData, isLoading: liveLoading } = useQuery({
    queryKey: ["admin", "live-metrics"],
    queryFn: adminApi.getLiveMetrics,
    refetchInterval: 30_000,
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <BarChart3 className="h-7 w-7 text-violet-600" />
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Live Metrics */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Live Metrics
            </h2>
            <RefreshCw className="h-4 w-4 text-slate-400" />
          </div>
          {liveLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-lg" />)}</div>
          ) : liveData ? (
            <div>
              {Object.entries(liveData as Record<string, unknown>)
                .filter(([, v]) => typeof v === "number" || typeof v === "string")
                .map(([key, val]) => (
                  <MetricRow
                    key={key}
                    label={key.replace(/([A-Z])/g, " $1").trim()}
                    value={String(val)}
                  />
                ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No live data.</p>
          )}
        </div>

        {/* Customer Analytics */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-violet-600" /> Customer Analytics
          </h2>
          {custLoading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-lg" />)}</div>
          ) : customerData ? (
            <div>
              {Object.entries(customerData as Record<string, unknown>)
                .filter(([, v]) => typeof v === "number" || typeof v === "string")
                .map(([key, val]) => (
                  <MetricRow
                    key={key}
                    label={key.replace(/([A-Z])/g, " $1").trim()}
                    value={String(val)}
                  />
                ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No customer data.</p>
          )}
        </div>

        {/* Funnel Analytics */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-violet-600" /> Conversion Funnel
            </h2>
            <div className="flex gap-1">
              {FUNNEL_DAYS_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setFunnelDays(d)}
                  className={`text-xs px-2 py-1 rounded-full transition-colors ${
                    funnelDays === d
                      ? "bg-violet-600 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-violet-100"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          {funnelLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-lg" />)}</div>
          ) : funnelData ? (
            <div>
              {Object.entries(funnelData as Record<string, unknown>)
                .filter(([, v]) => typeof v === "number" || typeof v === "string")
                .map(([key, val]) => (
                  <MetricRow
                    key={key}
                    label={key.replace(/([A-Z])/g, " $1").trim()}
                    value={String(val)}
                  />
                ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No funnel data.</p>
          )}
        </div>
      </div>
    </div>
  );
}
