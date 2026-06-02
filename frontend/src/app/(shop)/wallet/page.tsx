// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

"use client";
import { useQuery } from "@tanstack/react-query";
import { Wallet, ArrowDownLeft, ArrowUpRight, Gift, RefreshCw } from "lucide-react";
import { walletApi } from "@/lib/api";
import type { WalletTransaction } from "@/types";
import { Skeleton } from "@/components/ui/Skeleton";

const TYPE_META: Record<
  WalletTransaction["type"],
  { icon: typeof ArrowDownLeft; color: string; label: string }
> = {
  CREDIT: { icon: ArrowDownLeft, color: "text-green-600 bg-green-50", label: "Credit" },
  DEBIT: { icon: ArrowUpRight, color: "text-red-500 bg-red-50", label: "Debit" },
  REFUND: { icon: RefreshCw, color: "text-blue-600 bg-blue-50", label: "Refund" },
  BONUS: { icon: Gift, color: "text-violet-600 bg-violet-50", label: "Bonus" },
};

function TransactionRow({ tx }: { tx: WalletTransaction }) {
  const meta = TYPE_META[tx.type];
  const Icon = meta.icon;
  const isCredit = tx.type === "CREDIT" || tx.type === "REFUND" || tx.type === "BONUS";

  return (
    <div className="flex items-center gap-4 py-4 border-b border-slate-100 last:border-0">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${meta.color}`}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">
          {tx.description || meta.label}
        </p>
        {tx.reference && (
          <p className="text-xs text-slate-400 mt-0.5 truncate">Ref: {tx.reference}</p>
        )}
        <p className="text-xs text-slate-400 mt-0.5">
          {new Date(tx.createdAt).toLocaleString()}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p
          className={`text-sm font-bold ${
            isCredit ? "text-green-600" : "text-red-500"
          }`}
        >
          {isCredit ? "+" : "−"}₹{Math.abs(tx.amount).toFixed(2)}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">Bal: ₹{tx.balanceAfter.toFixed(2)}</p>
      </div>
    </div>
  );
}

export default function WalletPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["wallet"],
    queryFn: walletApi.get,
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Wallet className="h-7 w-7 text-violet-600" />
        <h1 className="text-2xl font-bold text-slate-900">My Wallet</h1>
      </div>

      {/* Balance card */}
      <div className="bg-gradient-to-br from-violet-600 to-indigo-700 rounded-2xl p-6 mb-8 text-white shadow-lg shadow-violet-200">
        <p className="text-sm font-medium opacity-80 mb-1">Available Balance</p>
        {isLoading ? (
          <Skeleton className="h-10 w-32 bg-white/20 rounded-lg" />
        ) : (
          <p className="text-4xl font-extrabold">
            ₹{(data?.balance ?? 0).toFixed(2)}
          </p>
        )}
        <p className="text-xs opacity-70 mt-2">
          Can be used at checkout as payment
        </p>
      </div>

      {/* Transactions */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">Transaction History</h2>

        {isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        )}

        {!isLoading && (!data?.transactions || data.transactions.length === 0) && (
          <div className="text-center py-12 text-slate-400">
            <Wallet className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No transactions yet</p>
          </div>
        )}

        {data?.transactions?.map((tx) => (
          <TransactionRow key={tx.id} tx={tx} />
        ))}
      </div>
    </div>
  );
}
