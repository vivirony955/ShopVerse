// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle, Clock, RefreshCw, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { formatPrice, formatDate, apiErrorMessage } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import type { RefundApproval } from "@/types";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  EXECUTED: "bg-slate-100 text-slate-600",
};

function RejectModal({
  approval,
  onClose,
  onConfirm,
}: {
  approval: RefundApproval;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md"
      >
        <h3 className="text-lg font-bold text-slate-900 mb-1">Reject Refund #{approval.id}</h3>
        <p className="text-sm text-slate-500 mb-4">Order #{approval.orderId} · {formatPrice(approval.amount)}</p>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Rejection reason</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Explain why this refund is being rejected…"
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
        />
        <div className="flex gap-3 mt-4">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium border border-slate-200 rounded-full hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason.trim())}
            className="flex-1 py-2.5 text-sm font-semibold bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function RefundApprovalsPage() {
  const qc = useQueryClient();
  const [rejectTarget, setRejectTarget] = useState<RefundApproval | null>(null);

  const { data, isLoading } = useQuery<RefundApproval[]>({
    queryKey: ["admin", "refund-approvals"],
    queryFn: adminApi.getPendingRefundApprovals,
    refetchInterval: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => adminApi.approveRefundRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "refund-approvals"] });
      toast.success("Refund approved");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e, "Approval failed")),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      adminApi.rejectRefundRequest(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "refund-approvals"] });
      setRejectTarget(null);
      toast.success("Refund rejected");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e, "Rejection failed")),
  });

  const approvals = data ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-7 w-7 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Refund Approvals</h1>
            <p className="text-sm text-slate-400">High-value refunds (≥ ₹5,000) require FINANCE approval</p>
          </div>
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["admin", "refund-approvals"] })}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-violet-600 transition-colors"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : approvals.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-400" />
          <p className="font-medium text-slate-600">No pending approvals</p>
          <p className="text-sm mt-1">All high-value refunds have been reviewed.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((a) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                {/* Left: details */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      {formatPrice(a.amount)}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[a.status]}`}>
                      {a.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">
                    Order <span className="font-medium">#{a.orderId}</span>
                  </p>
                  <p className="text-xs text-slate-400 max-w-xs">{a.reason}</p>
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Requested {formatDate(a.requestedAt)}
                  </p>
                </div>

                {/* Right: actions (only for PENDING) */}
                {a.status === "PENDING" && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => approveMutation.mutate(a.id)}
                      disabled={approveMutation.isPending}
                      className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-full hover:bg-green-700 transition-colors disabled:opacity-60"
                    >
                      <CheckCircle className="h-4 w-4" /> Approve
                    </button>
                    <button
                      onClick={() => setRejectTarget(a)}
                      className="flex items-center gap-1.5 px-4 py-2 border border-red-200 text-red-600 text-sm font-semibold rounded-full hover:bg-red-50 transition-colors"
                    >
                      <XCircle className="h-4 w-4" /> Reject
                    </button>
                  </div>
                )}
              </div>

              {a.rejectedReason && (
                <div className="mt-3 bg-red-50 rounded-xl px-3 py-2 text-xs text-red-700">
                  <span className="font-semibold">Rejection reason: </span>{a.rejectedReason}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Reject modal */}
      <AnimatePresence>
        {rejectTarget && (
          <RejectModal
            approval={rejectTarget}
            onClose={() => setRejectTarget(null)}
            onConfirm={(reason) => rejectMutation.mutate({ id: rejectTarget.id, reason })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
