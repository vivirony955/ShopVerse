// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Search } from "lucide-react";

const METHOD_COLOR: Record<string, string> = {
  POST: "bg-green-50 text-green-700",
  PATCH: "bg-amber-50 text-amber-700",
  PUT: "bg-blue-50 text-blue-700",
  DELETE: "bg-rose-50 text-rose-700",
};

export default function AdminAuditPage() {
  const [entity, setEntity] = useState("");
  const [entityInput, setEntityInput] = useState("");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["admin-audit", entity],
    queryFn: () => adminApi.getAuditLogs({ entity: entity || undefined, limit: 100 }),
    staleTime: 30_000,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>
        <p className="text-sm text-slate-400">All admin mutations, auto-recorded</p>
      </div>

      {/* Filter */}
      <form
        onSubmit={(e) => { e.preventDefault(); setEntity(entityInput); }}
        className="flex gap-2 mb-5"
      >
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={entityInput}
            onChange={(e) => setEntityInput(e.target.value)}
            placeholder="Filter by entity (e.g. orders)"
            className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-violet-400 w-64"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-700 transition-colors"
        >
          Filter
        </button>
        {entity && (
          <button
            type="button"
            onClick={() => { setEntity(""); setEntityInput(""); }}
            className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
          >
            Clear
          </button>
        )}
      </form>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (logs as any[]).length === 0 ? (
          <div className="py-20 text-center text-slate-400 text-sm">No audit entries found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs text-slate-400">
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Admin</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Entity</th>
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(logs as any[]).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 truncate max-w-[120px]">
                        {log.admin?.firstName ?? "Admin"}
                      </p>
                      <p className="text-xs text-slate-400 truncate max-w-[120px]">{log.admin?.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${METHOD_COLOR[log.method] ?? "bg-slate-100 text-slate-600"}`}>
                        {log.method}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{log.action}</td>
                    <td className="px-4 py-3 text-slate-600">{log.entity}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{log.entityId ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{log.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
