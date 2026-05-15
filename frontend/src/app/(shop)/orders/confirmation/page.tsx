// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, Package, Truck, Clock, ArrowRight } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ordersApi } from "@/lib/api";
import { formatPrice } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";

function OrderConfirmationContent() {
  const params = useSearchParams();
  const orderId = Number(params?.get("id"));

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => ordersApi.getOne(orderId),
    enabled: !!orderId,
  });

  const steps = [
    { icon: CheckCircle, label: "Order Placed", done: true },
    { icon: Clock, label: "Confirmed", done: ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"].includes(order?.status ?? "") },
    { icon: Package, label: "Processing", done: ["PROCESSING", "SHIPPED", "DELIVERED"].includes(order?.status ?? "") },
    { icon: Truck, label: "Shipped", done: ["SHIPPED", "DELIVERED"].includes(order?.status ?? "") },
  ];

  if (!orderId) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <p className="text-slate-400">No order ID provided.</p>
        <Link href="/orders" className="text-violet-600 hover:underline text-sm mt-3 block">
          View my orders
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="text-center mb-8"
      >
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="h-10 w-10 text-green-600" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Order Confirmed!</h1>
        <p className="text-slate-500 text-sm">
          Thank you for your purchase. We'll send you an email with order details shortly.
        </p>
      </motion.div>

      {isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : order ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
        >
          {/* Order summary */}
          <div className="p-5 border-b border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-slate-500">Order</p>
              <p className="text-sm font-bold text-slate-800">#{order.id}</p>
            </div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-slate-500">Total</p>
              <p className="text-sm font-bold text-slate-800">{formatPrice(order.total)}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Payment</p>
              <p className="text-sm text-slate-700">{order.paymentMethod}</p>
            </div>
          </div>

          {/* Items */}
          <div className="p-5 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Items</p>
            <div className="space-y-2">
              {order.items?.slice(0, 3).map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 truncate flex-1 mr-2">
                    {item.variant?.product?.name ?? "Product"}
                    {item.variant?.size ? ` (${item.variant.size})` : ""}
                  </span>
                  <span className="text-slate-500 flex-shrink-0">×{item.quantity}</span>
                </div>
              ))}
              {(order.items?.length ?? 0) > 3 && (
                <p className="text-xs text-slate-400">+{(order.items?.length ?? 0) - 3} more items</p>
              )}
            </div>
          </div>

          {/* Status steps */}
          <div className="p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Order Status</p>
            <div className="flex items-center justify-between">
              {steps.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div key={step.label} className="flex flex-col items-center flex-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1.5 ${step.done ? "bg-green-500" : "bg-slate-100"}`}>
                      <Icon className={`h-4 w-4 ${step.done ? "text-white" : "text-slate-400"}`} />
                    </div>
                    <p className={`text-xs text-center ${step.done ? "text-green-600 font-medium" : "text-slate-400"}`}>
                      {step.label}
                    </p>
                    {i < steps.length - 1 && (
                      <div className={`absolute hidden`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      ) : null}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="flex flex-col gap-3 mt-6"
      >
        <Link
          href={`/orders/${orderId}`}
          className="flex items-center justify-center gap-2 bg-violet-600 text-white font-semibold py-3 rounded-full hover:bg-violet-700 transition-colors"
        >
          Track Your Order <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/products"
          className="text-center text-sm text-slate-500 hover:text-violet-600 transition-colors py-2"
        >
          Continue Shopping
        </Link>
      </motion.div>
    </div>
  );
}

export default function OrderConfirmationPage() {
  return (
    <Suspense>
      <OrderConfirmationContent />
    </Suspense>
  );
}
