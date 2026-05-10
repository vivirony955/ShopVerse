// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, http } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";
import { CheckCircle2, AlertTriangle } from "lucide-react";

const LEVELS = ["ALL", "error", "warn", "fatal"];

export default function AdminErrorsPage() {
  const qc = useQueryClient();
  const [level, setLevel] = useState("ALL");

  const { data: errors = [], isLoading } = useQuery({
    queryKey: ["admin-errors", level],
    queryFn: () => adminApi.getErrors(100, level === "ALL" ? undefined : level),
    refetchInterval: 30_000,
  });

  const resolveMutation = useMutation({
    mutationFn: (id: number) =>
      http.patch(`/admin/errors/${id}/resolve`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-errors"] });
      toast.success("Marked resolved");
    },
  });

  const levelColor = (l: string) =>
    l === "fatal" ? "bg-red-100 text-red-700" :
    l === "error" ? "bg-rose-50 text-rose-600" :
    "bg-amber-50 text-amber-600";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Error Logs</h1>
        <div className="flex gap-2">
          {LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                level === l ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (errors as any[]).length === 0 ? (
          <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-400" />
            <p className="text-sm">No errors to show</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {(errors as any[]).map((e) => (
              <div key={e.id} className="px-5 py-4 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${levelColor(e.level)}`}>
                        {e.level}
                      </span>
                      {e.statusCode && (
                        <span className="text-xs text-slate-400">{e.statusCode}</span>
                      )}
                      <span className="text-xs text-slate-400">{formatDate(e.createdAt)}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-900 truncate">{e.message}</p>
                    {e.url && <p className="text-xs text-slate-400 mt-0.5">{e.method} {e.url}</p>}
                    {e.stack && (
                      <pre className="mt-2 text-[10px] text-slate-400 bg-slate-50 rounded-lg p-2 overflow-x-auto max-h-20">
                        {e.stack.slice(0, 300)}
                      </pre>
                    )}
                  </div>
                  {!e.resolved && (
                    <button
                      onClick={() => resolveMutation.mutate(e.id)}
                      disabled={resolveMutation.isPending}
                      className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
                    </button>
                  )}
                  {e.resolved && (
                    <span className="flex-shrink-0 text-xs text-green-600 font-medium">Resolved</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
