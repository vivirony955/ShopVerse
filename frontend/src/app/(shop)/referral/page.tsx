// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Users, Copy, Check, Gift, ArrowRight } from "lucide-react";
import toast from "react-hot-toast";
import { referralApi } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import Button from "@/components/ui/Button";

export default function ReferralPage() {
  const [copied, setCopied] = useState(false);
  const [inputCode, setInputCode] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["referral", "code"],
    queryFn: referralApi.getMyCode,
  });

  const applyMutation = useMutation({
    mutationFn: () => referralApi.apply(inputCode.trim()),
    onSuccess: (res) => {
      toast.success(res.message ?? "Referral applied! You earned bonus points.");
      setInputCode("");
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.message ?? "Failed to apply referral code"),
  });

  const copyCode = () => {
    if (!data?.referralCode) return;
    navigator.clipboard.writeText(data.referralCode);
    setCopied(true);
    toast.success("Code copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const SITE_URL =
    typeof window !== "undefined" ? window.location.origin : "https://shopverse.com";

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Users className="h-7 w-7 text-violet-600" />
        <h1 className="text-2xl font-bold text-slate-900">Refer & Earn</h1>
      </div>

      {/* Hero */}
      <div className="bg-gradient-to-br from-violet-600 to-indigo-700 rounded-2xl p-6 text-white mb-6">
        <h2 className="text-xl font-extrabold mb-2">Invite friends, earn points!</h2>
        <p className="text-sm text-white/80 mb-4">
          You earn <strong>200 points</strong> for every friend who signs up using your code.
          Your friend gets <strong>100 bonus points</strong> too.
        </p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-xl px-4 py-2.5 flex-1">
            <Gift className="h-4 w-4 flex-shrink-0" />
            {isLoading ? (
              <Skeleton className="h-5 w-24 bg-white/20 rounded" />
            ) : (
              <span className="font-mono font-bold text-sm tracking-widest">{data?.referralCode}</span>
            )}
          </div>
          <button
            onClick={copyCode}
            className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl hover:bg-white/30 transition-colors"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Share link */}
      {data?.referralCode && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6">
          <p className="text-sm font-semibold text-slate-700 mb-2">Share your link</p>
          <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
            <p className="text-xs text-slate-500 truncate flex-1">
              {SITE_URL}/register?ref={data.referralCode}
            </p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${SITE_URL}/register?ref=${data.referralCode}`);
                toast.success("Link copied!");
              }}
              className="text-violet-600 hover:text-violet-800 flex-shrink-0"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          {(data?.referralCount ?? 0) > 0 && (
            <p className="text-xs text-slate-500 mt-2">
              {data.referralCount} friend{data.referralCount !== 1 ? "s" : ""} signed up using your code
            </p>
          )}
        </div>
      )}

      {/* Apply a code */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6">
        <h2 className="font-bold text-slate-800 mb-1">Have a referral code?</h2>
        <p className="text-sm text-slate-500 mb-4">Enter a friend's code to claim your 100 bonus points.</p>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="e.g. SV-42-AB12"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value.toUpperCase())}
            className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <Button
            onClick={() => applyMutation.mutate()}
            disabled={!inputCode.trim() || applyMutation.isPending}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { step: "1", title: "Share your code", desc: "Send your unique code to friends" },
          { step: "2", title: "Friend signs up", desc: "They register using your code" },
          { step: "3", title: "Both earn points", desc: "You get 200, they get 100" },
        ].map((item) => (
          <div key={item.step} className="text-center p-4 bg-slate-50 rounded-2xl">
            <div className="w-8 h-8 bg-violet-600 text-white rounded-full flex items-center justify-center text-sm font-bold mx-auto mb-2">
              {item.step}
            </div>
            <p className="text-xs font-semibold text-slate-800 mb-1">{item.title}</p>
            <p className="text-xs text-slate-500">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
