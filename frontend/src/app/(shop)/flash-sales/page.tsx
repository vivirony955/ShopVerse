// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { flashSalesApi } from "@/lib/api";
import type { FlashSale } from "@/types";
import ProductCard from "@/components/product/ProductCard";
import { Skeleton } from "@/components/ui/Skeleton";

function useCountdown(endsAt: string) {
  const calc = () => {
    const diff = Math.max(0, new Date(endsAt).getTime() - Date.now());
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1_000);
    return { h, m, s, expired: diff === 0 };
  };
  const [time, setTime] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setTime(calc()), 1_000);
    return () => clearInterval(id);
  });
  return time;
}

function Pad({ n }: { n: number }) {
  return <span>{String(n).padStart(2, "0")}</span>;
}

function SaleCountdown({ endsAt }: { endsAt: string }) {
  const { h, m, s, expired } = useCountdown(endsAt);
  if (expired) return <span className="text-sm text-red-500 font-medium">Sale ended</span>;
  return (
    <div className="flex items-center gap-1 font-mono text-sm font-bold text-white bg-red-600 rounded-lg px-3 py-1.5">
      <Pad n={h} />
      <span>:</span>
      <Pad n={m} />
      <span>:</span>
      <Pad n={s} />
    </div>
  );
}

function SaleCard({ sale }: { sale: FlashSale }) {
  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-amber-500 fill-amber-500" />
          <h2 className="text-xl font-bold text-slate-900">{sale.title}</h2>
          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">
            {sale.discountPct}% OFF
          </span>
        </div>
        <SaleCountdown endsAt={sale.endsAt} />
      </div>

      {sale.products.length === 0 ? (
        <p className="text-slate-500 text-sm">No products in this sale.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {sale.products.map(({ product, perUserMaxQty }, i) => (
            <div key={product.id} className="relative">
              <ProductCard product={product} index={i} />
              {perUserMaxQty > 0 && (
                <span className="absolute top-2 left-2 z-10 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full pointer-events-none">
                  Max {perUserMaxQty}/person
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function FlashSalesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["flash-sales"],
    queryFn: flashSalesApi.getAll,
  });

  const activeSales = data?.filter((s) => s.status === "ACTIVE") ?? [];
  const scheduledSales = data?.filter((s) => s.status === "SCHEDULED") ?? [];

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Zap className="h-8 w-8 text-amber-500 fill-amber-400" />
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Flash Sales</h1>
          <p className="text-slate-500 text-sm mt-1">Limited-time deals — grab them before they expire!</p>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && activeSales.length === 0 && scheduledSales.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          <Zap className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No flash sales right now</p>
          <p className="text-sm mt-1">Check back soon for exciting deals!</p>
        </div>
      )}

      {activeSales.map((sale) => (
        <SaleCard key={sale.id} sale={sale} />
      ))}

      {scheduledSales.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-bold text-slate-700 mb-4">Upcoming Sales</h2>
          <div className="grid gap-3">
            {scheduledSales.map((sale) => (
              <div
                key={sale.id}
                className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-5 py-4"
              >
                <div>
                  <p className="font-semibold text-slate-800">{sale.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Starts {new Date(sale.startsAt).toLocaleString()}
                  </p>
                </div>
                <span className="text-sm font-bold text-violet-600">{sale.discountPct}% OFF</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
