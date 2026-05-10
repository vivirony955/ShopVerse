"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, http } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";
import { ShieldAlert, CheckCircle2, AlertTriangle } from "lucide-react";

const RISK_COLOR = (score: number) =>
  score >= 70 ? "text-rose-600 bg-rose-50" : score >= 40 ? "text-amber-600 bg-amber-50" : "text-green-600 bg-green-50";

export default function AdminFraudPage() {
  const qc = useQueryClient();

  const { data: flags = [], isLoading } = useQuery({
    queryKey: ["admin-fraud-flags"],
    queryFn: adminApi.getFraudFlags,
    refetchInterval: 60_000,
  });

  const resolveMutation = useMutation({
    mutationFn: (id: number) =>
      http.patch(`/fraud/flags/${id}/resolve`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-fraud-flags"] });
      toast.success("Flag resolved");
    },
    onError: () => toast.error("Failed to resolve flag"),
  });

  const openFlags = (flags as any[]).filter((f) => !f.resolved);
  const resolvedFlags = (flags as any[]).filter((f) => f.resolved);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <ShieldAlert className="h-6 w-6 text-rose-500" />
        <h1 className="text-2xl font-bold text-slate-900">Fraud Review Queue</h1>
        {openFlags.length > 0 && (
          <span className="text-xs font-bold bg-rose-100 text-rose-700 px-2.5 py-1 rounded-full">
            {openFlags.length} open
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : openFlags.length === 0 && resolvedFlags.length === 0 ? (
        <div className="py-20 text-center flex flex-col items-center gap-3 text-slate-400">
          <CheckCircle2 className="h-10 w-10 text-green-400" />
          <p className="text-sm">No fraud flags — all clear</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Open flags */}
          {openFlags.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-500" /> Open Flags
              </h2>
              <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-50">
                {openFlags.map((flag: any) => (
                  <FlagRow key={flag.id} flag={flag} onResolve={() => resolveMutation.mutate(flag.id)} resolving={resolveMutation.isPending} />
                ))}
              </div>
            </div>
          )}

          {/* Resolved flags */}
          {resolvedFlags.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" /> Recently Resolved
              </h2>
              <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-50 opacity-70">
                {resolvedFlags.slice(0, 10).map((flag: any) => (
                  <FlagRow key={flag.id} flag={flag} resolved />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FlagRow({ flag, onResolve, resolving, resolved }: {
  flag: any;
  onResolve?: () => void;
  resolving?: boolean;
  resolved?: boolean;
}) {
  const score = flag.riskScore ?? 0;
  return (
    <div className="px-5 py-4 hover:bg-slate-50/50 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${score >= 70 ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
              Risk {score}
            </span>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{flag.flagType ?? flag.type ?? "FRAUD"}</span>
            <span className="text-xs text-slate-400">{formatDate(flag.createdAt)}</span>
          </div>
          <p className="text-sm font-medium text-slate-900">{flag.reason ?? flag.description ?? "Suspicious activity detected"}</p>
          <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
            {flag.userId && <span>User #{flag.userId}</span>}
            {flag.orderId && <span>Order #{flag.orderId}</span>}
            {flag.ip && <span>IP: {flag.ip}</span>}
          </div>
        </div>

        <div className="flex-shrink-0">
          {resolved ? (
            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Resolved
            </span>
          ) : (
            <button
              onClick={onResolve}
              disabled={resolving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
