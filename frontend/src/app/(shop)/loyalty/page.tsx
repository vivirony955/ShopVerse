// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Star, TrendingUp, ArrowUpRight, ArrowDownLeft, Gift, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { loyaltyApi, loyaltyTiersApi } from "@/lib/api";
import { apiErrorMessage } from "@/lib/utils";
import type { LoyaltyTransaction, LoyaltyTier } from "@/types";
import { Skeleton } from "@/components/ui/Skeleton";
import Button from "@/components/ui/Button";

const POINT_VALUE = 0.5; // ₹0.50 per point

const TYPE_META: Record<string, { icon: typeof Star; color: string; label: string }> = {
  EARN: { icon: ArrowDownLeft, color: "text-green-600 bg-green-50", label: "Earned" },
  REDEEM: { icon: ArrowUpRight, color: "text-orange-500 bg-orange-50", label: "Redeemed" },
  REFERRAL_BONUS: { icon: Gift, color: "text-violet-600 bg-violet-50", label: "Referral Bonus" },
  ADMIN_CREDIT: { icon: RefreshCw, color: "text-blue-600 bg-blue-50", label: "Admin Credit" },
};

export default function LoyaltyPage() {
  const qc = useQueryClient();
  const [redeemPoints, setRedeemPoints] = useState("");

  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ["loyalty", "balance"],
    queryFn: loyaltyApi.getBalance,
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["loyalty", "history"],
    queryFn: loyaltyApi.getHistory,
  });

  const redeemMutation = useMutation({
    mutationFn: () => loyaltyApi.redeem(Number(redeemPoints)),
    onSuccess: (res) => {
      toast.success(`Redeemed! ₹${res.discountAmount?.toFixed(2)} credit applied`);
      qc.invalidateQueries({ queryKey: ["loyalty"] });
      setRedeemPoints("");
    },
    onError: (err: unknown) =>
      toast.error(apiErrorMessage(err, "Redemption failed")),
  });

  const { data: tiers } = useQuery({ queryKey: ["loyalty-tiers"], queryFn: loyaltyTiersApi.getAll });

  const pts = balance?.points ?? 0;
  const rupees = (pts * POINT_VALUE).toFixed(2);

  const currentTier =
    tiers?.slice().sort((a: LoyaltyTier, b: LoyaltyTier) => b.minPoints - a.minPoints).find((t) => pts >= t.minPoints) ?? null;
  const nextTier =
    tiers?.slice().sort((a: LoyaltyTier, b: LoyaltyTier) => a.minPoints - b.minPoints).find((t) => pts < t.minPoints) ?? null;

  const TIER_COLORS: Record<string, string> = {
    BRONZE: "bg-amber-100 text-amber-700",
    SILVER: "bg-slate-100 text-slate-700",
    GOLD: "bg-yellow-100 text-yellow-700",
    PLATINUM: "bg-violet-100 text-violet-700",
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Star className="h-7 w-7 text-amber-500 fill-amber-400" />
        <h1 className="text-2xl font-bold text-slate-900">Loyalty Points</h1>
      </div>

      {/* F2-19: Loyalty Tier Badge */}
      {tiers && tiers.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          {currentTier ? (
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${TIER_COLORS[currentTier.name] ?? "bg-slate-100 text-slate-700"}`}>
              {currentTier.name} member · {currentTier.earnMultiplier}× earn rate
            </span>
          ) : (
            <span className="text-xs text-slate-400">No tier yet — earn points to unlock benefits</span>
          )}
          {nextTier && (
            <span className="text-xs text-slate-500">{nextTier.minPoints - pts} pts to {nextTier.name}</span>
          )}
        </div>
      )}
      {currentTier && currentTier.perks && currentTier.perks.length > 0 && (
        <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 mb-4 text-sm">
          <p className="font-semibold text-violet-800 mb-1">{currentTier.name} Perks</p>
          <ul className="list-disc list-inside text-violet-700 space-y-0.5">
            {currentTier.perks.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}

      {/* Balance card */}
      <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl p-6 mb-6 text-white shadow-lg shadow-orange-100">
        <p className="text-sm font-medium opacity-80 mb-1">Your Points Balance</p>
        {balanceLoading ? (
          <Skeleton className="h-10 w-24 bg-white/20 rounded-lg" />
        ) : (
          <>
            <p className="text-4xl font-extrabold">{pts.toLocaleString()} pts</p>
            <p className="text-sm opacity-80 mt-1">≈ ₹{rupees} discount value</p>
          </>
        )}
      </div>

      {/* Redeem */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4.5 w-4.5 text-slate-400" />
          <h2 className="font-bold text-slate-800">Redeem Points</h2>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Each point = ₹{POINT_VALUE}. Minimum redemption: 100 points.
        </p>
        <div className="flex gap-3">
          <input
            type="number"
            min={100}
            max={pts}
            placeholder="Points to redeem"
            value={redeemPoints}
            onChange={(e) => setRedeemPoints(e.target.value)}
            className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <Button
            onClick={() => redeemMutation.mutate()}
            disabled={!redeemPoints || Number(redeemPoints) < 100 || Number(redeemPoints) > pts || redeemMutation.isPending}
          >
            Redeem
          </Button>
        </div>
        {redeemPoints && Number(redeemPoints) >= 100 && (
          <p className="text-xs text-green-600 mt-2">
            → ₹{(Number(redeemPoints) * POINT_VALUE).toFixed(2)} off your next order
          </p>
        )}
      </div>

      {/* How to earn */}
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 mb-6">
        <h3 className="font-bold text-slate-800 mb-3 text-sm">How to earn points</h3>
        <ul className="space-y-2 text-sm text-slate-600">
          <li className="flex items-center gap-2"><span className="text-amber-500 font-bold">+1pt</span> per ₹10 spent on any order</li>
          <li className="flex items-center gap-2"><span className="text-amber-500 font-bold">+200pts</span> when a friend signs up with your referral code</li>
          <li className="flex items-center gap-2"><span className="text-amber-500 font-bold">+100pts</span> for writing a product review</li>
        </ul>
      </div>

      {/* History */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="font-bold text-slate-800 mb-4">Transaction History</h2>

        {historyLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        )}

        {!historyLoading && (!history || history.length === 0) && (
          <p className="text-sm text-slate-400 text-center py-8">No transactions yet. Start shopping to earn points!</p>
        )}

        {history?.map((tx: LoyaltyTransaction) => {
          const meta = TYPE_META[tx.type] ?? TYPE_META.EARN;
          const Icon = meta.icon;
          const isEarn = tx.points > 0;
          return (
            <div key={tx.id} className="flex items-center gap-4 py-3 border-b border-slate-50 last:border-0">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${meta.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{tx.note ?? meta.label}</p>
                <p className="text-xs text-slate-400">{new Date(tx.createdAt).toLocaleString()}</p>
              </div>
              <p className={`text-sm font-bold ${isEarn ? "text-green-600" : "text-red-500"}`}>
                {isEarn ? "+" : ""}{tx.points.toLocaleString()} pts
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
