// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminPluginsApi, type PluginAdminEntry, type PluginRuntimeMetricsEntry } from "@/lib/api";
import { Power, PowerOff, CheckCircle2, AlertTriangle, Shield } from "lucide-react";
import toast from "react-hot-toast";

/**
 * /admin/plugins — W6.T3 (plan §6 admin surface) + Task 6 metrics bridge.
 *
 * Surfaces every loaded plugin's runtime state from
 * `GET /admin/plugins` (PluginAdminController) plus rolling p95 +
 * breaker state from `GET /admin/plugins/runtime-metrics`. Admin
 * operators can flip the W1.T20 Redis kill-switch per plugin without
 * redeploying.
 *
 * Two independent queries: load status (refetch every 30 s — only
 * changes on redeploy) and runtime metrics (every 10 s — breaker
 * state can flip rapidly under failure). An outage of the metrics
 * endpoint degrades gracefully: rows still render, "—" replaces
 * missing values.
 */
export default function AdminPluginsPage() {
  const qc = useQueryClient();

  const { data: plugins = [], isLoading } = useQuery({
    queryKey: ["admin-plugins"],
    queryFn: () => adminPluginsApi.list(),
    refetchInterval: 30_000,
  });

  // Task 6 — separate query so an outage of the metrics endpoint
  // doesn't block the load-status table. Higher refresh rate (10s)
  // because breaker state can change rapidly when a plugin starts
  // failing; load status changes only on redeploy.
  const { data: runtimeMetrics = {} } = useQuery({
    queryKey: ["admin-plugins-runtime-metrics"],
    queryFn: () => adminPluginsApi.runtimeMetrics(),
    refetchInterval: 10_000,
  });

  const disableMutation = useMutation({
    mutationFn: (id: string) => adminPluginsApi.disable(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["admin-plugins"] });
      toast.success(`${tail(id)} disabled`);
    },
    onError: () => toast.error("Failed to disable plugin"),
  });

  const enableMutation = useMutation({
    mutationFn: (id: string) => adminPluginsApi.enable(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["admin-plugins"] });
      toast.success(`${tail(id)} enabled`);
    },
    onError: () => toast.error("Failed to enable plugin"),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Plugins</h1>
          <p className="text-sm text-slate-500 mt-1">
            Runtime state of every loaded plugin. Disable here applies
            via Redis kill-switch (W1.T20) — no redeploy required.
          </p>
        </div>
        <div className="text-xs font-medium text-slate-500 bg-slate-100 rounded-full px-3 py-1.5">
          {plugins.length} {plugins.length === 1 ? "plugin" : "plugins"}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : plugins.length === 0 ? (
          <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-3">
            <Shield className="h-8 w-8" />
            <p className="text-sm">No plugins registered.</p>
            <p className="text-xs">
              Add entries to <code className="font-mono">backend/plugins.config.ts</code> and rebuild.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
                <th className="px-5 py-3 text-left">Plugin</th>
                <th className="px-5 py-3 text-left">Load status</th>
                <th className="px-5 py-3 text-left">Operator state</th>
                <th className="px-5 py-3 text-left">Breaker</th>
                <th className="px-5 py-3 text-left">p95 (5 min)</th>
                <th className="px-5 py-3 text-left">Error</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {plugins.map((p) => {
                const m = runtimeMetrics[p.id];
                return (
                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-4">
                    <code className="font-mono text-xs text-slate-700">{p.id}</code>
                  </td>
                  <td className="px-5 py-4">
                    <LoadStatusBadge status={p.loadStatus} />
                  </td>
                  <td className="px-5 py-4">
                    {p.operatorDisabled ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full">
                        <PowerOff className="h-3 w-3" /> Disabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                        <CheckCircle2 className="h-3 w-3" /> Active
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <BreakerBadge state={m?.breakerState ?? null} />
                  </td>
                  <td className="px-5 py-4">
                    <P95Cell ms={m?.hookP95Ms ?? null} />
                  </td>
                  <td className="px-5 py-4">
                    {p.error ? (
                      <span className="text-xs text-rose-600" title={p.error}>
                        {truncate(p.error, 50)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    {p.operatorDisabled ? (
                      <button
                        type="button"
                        onClick={() => enableMutation.mutate(p.id)}
                        disabled={enableMutation.isPending}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
                        aria-label={`Enable ${tail(p.id)}`}
                      >
                        <Power className="h-3.5 w-3.5" /> Enable
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => disableMutation.mutate(p.id)}
                        disabled={disableMutation.isPending}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 hover:text-rose-900 disabled:opacity-50"
                        aria-label={`Disable ${tail(p.id)}`}
                      >
                        <PowerOff className="h-3.5 w-3.5" /> Disable
                      </button>
                    )}
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Disable is a soft kill-switch via Redis — the plugin module
        stays loaded in the DI graph; its hooks, events, and crons skip.
        To stop loading entirely, set <code className="font-mono">enabled: false</code> in
        the manifest and rebuild.
      </p>
    </div>
  );
}

function BreakerBadge({ state }: { state: PluginRuntimeMetricsEntry["breakerState"] }) {
  if (state === null) {
    // Plugin has no hooks registered (e.g. content-only). Rendered
    // as "—" to distinguish "no measurement" from a closed breaker.
    return <span className="text-xs text-slate-300">—</span>;
  }
  const map = {
    closed: { label: "Closed", cls: "text-emerald-700 bg-emerald-50" },
    "half-open": { label: "Half-open", cls: "text-amber-700 bg-amber-50" },
    open: { label: "Open", cls: "text-rose-700 bg-rose-50" },
  } as const;
  const entry = map[state];
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${entry.cls}`}>
      {entry.label}
    </span>
  );
}

function P95Cell({ ms }: { ms: number | null }) {
  if (ms === null) {
    // Never measured — distinct from "0 ms" (an instant return).
    return <span className="text-xs text-slate-300">—</span>;
  }
  return <span className="text-xs font-mono text-slate-700">{ms.toFixed(1)} ms</span>;
}

function LoadStatusBadge({ status }: { status: PluginAdminEntry["loadStatus"] }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    loaded: {
      label: "Loaded",
      cls: "text-emerald-700 bg-emerald-50",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    disabled: {
      label: "Disabled (manifest)",
      cls: "text-slate-700 bg-slate-100",
      icon: <PowerOff className="h-3 w-3" />,
    },
    "version-mismatch": {
      label: "Version mismatch",
      cls: "text-amber-700 bg-amber-50",
      icon: <AlertTriangle className="h-3 w-3" />,
    },
    failed: {
      label: "Failed",
      cls: "text-rose-700 bg-rose-50",
      icon: <AlertTriangle className="h-3 w-3" />,
    },
  };
  const fallback = { label: status, cls: "text-slate-600 bg-slate-50", icon: null };
  const entry = map[status] ?? fallback;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${entry.cls}`}
    >
      {entry.icon}
      {entry.label}
    </span>
  );
}

function tail(id: string): string {
  const parts = id.split("/");
  return parts[parts.length - 1] || id;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
