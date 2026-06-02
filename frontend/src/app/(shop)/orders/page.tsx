// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

"use client";
import Link from "next/link";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { Package, ChevronRight, RefreshCw } from "lucide-react";
import { ordersApi, experienceApi, cartApi } from "@/lib/api";
import { formatPrice, formatDate, ORDER_STATUS_LABEL, getProductImage } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useCartStore } from "@/lib/store";

export default function OrdersPage() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const { openCart } = useCartStore();

  const { data: orders, isLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: ordersApi.getAll,
    enabled: !!session,
  });

  const { data: recentlyPurchased } = useQuery({
    queryKey: ["recently-purchased"],
    queryFn: experienceApi.recentlyPurchased,
    enabled: !!session,
    staleTime: 5 * 60_000,
  });

  const buyAgainMutation = useMutation({
    mutationFn: ({ variantId }: { variantId: number }) =>
      cartApi.addItem(variantId, 1),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cart"] });
      openCart();
      toast.success("Added to bag");
    },
    onError: () => toast.error("Failed to add to bag"),
  });

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <Package className="h-16 w-16 text-slate-200 mb-4" />
        <h2 className="text-xl font-bold text-slate-700">Please sign in to view orders</h2>
        <Link href="/login?callbackUrl=/orders" className="mt-6 px-8 py-3 bg-violet-600 text-white font-semibold rounded-full hover:bg-violet-700 transition-colors">
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Orders</h1>
          {orders && <p className="text-sm text-slate-400 mt-0.5">{orders.length} orders total</p>}
        </div>
      </div>

      {/* Buy Again */}
      {recentlyPurchased && recentlyPurchased.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-violet-600" /> Buy Again
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {recentlyPurchased.slice(0, 8).map((p) => (
              <div key={p.id} className="flex-shrink-0 w-36 bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <Link href={`/products/${p.id}`}>
                  <div className="relative h-40 bg-slate-50">
                    <Image src={getProductImage(p.images)} alt={p.name} fill className="object-cover" />
                  </div>
                </Link>
                <div className="p-2.5">
                  <p className="text-xs font-medium text-slate-800 line-clamp-2 mb-1">{p.name}</p>
                  <p className="text-xs font-bold text-slate-900 mb-2">
                    {formatPrice(p.basePrice * (1 - p.discountPct / 100))}
                  </p>
                  <button
                    onClick={() => {
                      const variantId = p.variants?.[0]?.id;
                      if (variantId) buyAgainMutation.mutate({ variantId });
                    }}
                    disabled={buyAgainMutation.isPending || !p.variants?.[0]}
                    className="w-full py-1.5 text-[11px] font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    Add to Bag
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse">
              <div className="flex gap-3 mb-3">
                <div className="w-16 h-20 bg-slate-100 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                  <div className="h-3 bg-slate-100 rounded w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : !orders || orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Package className="h-20 w-20 text-slate-100 mb-4" />
          <h2 className="text-lg font-semibold text-slate-700">No orders yet</h2>
          <p className="text-slate-400 text-sm mt-1">Your order history will appear here</p>
          <Link href="/products" className="mt-6 px-8 py-3 bg-violet-600 text-white font-semibold rounded-full hover:bg-violet-700 transition-colors">
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order, i) => {
            const statusInfo = ORDER_STATUS_LABEL[order.status] || { label: order.status, color: "bg-slate-100 text-slate-600" };
            const previewItems = order.items.slice(0, 3);

            return (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <Link href={`/orders/${order.id}`}>
                  <div className="bg-white rounded-2xl border border-slate-100 hover:border-violet-200 hover:shadow-md hover:shadow-violet-50 transition-all p-5 group">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
                          <Package className="h-4 w-4 text-violet-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Order #{order.id}</p>
                          <p className="text-xs text-slate-400">{formatDate(order.createdAt)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-violet-500 transition-colors" />
                      </div>
                    </div>

                    {/* Item previews */}
                    <div className="flex gap-2 mb-3">
                      {previewItems.map((item) => (
                        <div key={item.id} className="relative w-14 h-16 rounded-xl overflow-hidden bg-slate-50 flex-shrink-0">
                          <Image
                            src={getProductImage(item.variant.product.images)}
                            alt={item.variant.product.name}
                            fill
                            className="object-cover"
                          />
                        </div>
                      ))}
                      {order.items.length > 3 && (
                        <div className="w-14 h-16 rounded-xl bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                          +{order.items.length - 3}
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between border-t border-slate-50 pt-3">
                      <p className="text-xs text-slate-400">{order.items.length} item{order.items.length !== 1 ? "s" : ""}</p>
                      <p className="text-sm font-bold text-slate-900">{formatPrice(order.total)}</p>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
