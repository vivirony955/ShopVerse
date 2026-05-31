// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import {
  Package, MapPin, Tag, RotateCcw, X,
  Check, Truck, Clock, ChevronLeft, Navigation, Download, Star, RefreshCw,
} from "lucide-react";
import toast from "react-hot-toast";
import { ordersApi, paymentsApi, invoicesApi, deliveryRatingApi, exchangeApi } from "@/lib/api";
import { formatPrice, formatDate, ORDER_STATUS_LABEL, getProductImage, apiErrorMessage } from "@/lib/utils";
import { PageSkeleton } from "@/components/ui/Skeleton";

const ORDER_TIMELINE: { status: string; icon: typeof Check }[] = [
  { status: "PENDING", icon: Clock },
  { status: "CONFIRMED", icon: Check },
  { status: "PROCESSING", icon: Package },
  { status: "SHIPPED", icon: Truck },
  { status: "DELIVERED", icon: Check },
];

export default function OrderDetailPage() {
  const routeParams = useParams<{ id: string }>();
  const orderId = Number(routeParams?.id);
  const { data: session } = useSession();
  const qc = useQueryClient();

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => ordersApi.getOne(orderId),
    enabled: !!session && !isNaN(orderId),
  });

  const cancelMutation = useMutation({
    mutationFn: () => ordersApi.cancel(orderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Order cancelled");
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, "Cannot cancel order")),
  });

  const returnMutation = useMutation({
    mutationFn: () => ordersApi.requestReturn(orderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Return request submitted");
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, "Cannot request return")),
  });

  const refundMutation = useMutation({
    mutationFn: () => paymentsApi.refund(orderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      toast.success("Refund initiated — will appear in 5–7 business days");
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, "Refund failed")),
  });

  // Hooks below MUST run on every render — they used to live after the
  // `if (isLoading) return …` / `if (!order) return …` early returns,
  // which violates rules-of-hooks (hooks count changes when the order
  // load completes). Order-shape access guards `order?.…` because
  // `order` is undefined on the first render.
  // F2-13: Delivery rating
  const { data: deliveryRating } = useQuery({
    queryKey: ["delivery-rating", orderId],
    queryFn: () => deliveryRatingApi.get(orderId),
    enabled: order?.status === "DELIVERED",
  });
  const [ratingVal, setRatingVal] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [showRatingForm, setShowRatingForm] = useState(false);

  // F2-12: Exchange request — state lives above the early returns so
  // the hook order is stable across loading → loaded transitions.
  const [showExchangeForm, setShowExchangeForm] = useState(false);
  const [exchangeItemId, setExchangeItemId] = useState<number | null>(null);
  const [exchangeVariantId, setExchangeVariantId] = useState<number | null>(null);
  const [exchangeReason, setExchangeReason] = useState("");

  if (isLoading) return <PageSkeleton />;
  if (!order) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <p className="text-5xl mb-4">😕</p>
      <p className="text-lg font-semibold text-slate-700">Order not found</p>
      <Link href="/orders" className="mt-4 text-violet-600 hover:underline text-sm">
        Back to orders
      </Link>
    </div>
  );

  const statusInfo = ORDER_STATUS_LABEL[order.status] || { label: order.status, color: "bg-slate-100 text-slate-600" };
  const normalStatuses = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];
  const currentIdx = normalStatuses.indexOf(order.status);
  const canCancel = ["PENDING", "CONFIRMED"].includes(order.status);
  const canReturn = order.status === "DELIVERED";
  const canRefundToCard = order.status === "RETURN_REQUESTED" && order.paymentStatus === "PAID" && !!order.paymentId;
  const addr = order.addressSnapshot;

  async function submitRating() {
    try {
      await deliveryRatingApi.rate(orderId, ratingVal, ratingComment);
      qc.invalidateQueries({ queryKey: ["delivery-rating", orderId] });
      setShowRatingForm(false);
      toast.success("Thanks for your feedback!");
    } catch { toast.error("Failed to submit rating"); }
  }

  async function submitExchange() {
    if (!exchangeItemId || !exchangeVariantId || !exchangeReason) return;
    try {
      await exchangeApi.request({ orderId, orderItemId: exchangeItemId, requestedVariantId: exchangeVariantId, reason: exchangeReason });
      setShowExchangeForm(false);
      toast.success("Exchange request submitted!");
    } catch (e: unknown) { toast.error(apiErrorMessage(e, "Exchange request failed")); }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Back link */}
      <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-violet-600 transition-colors mb-6">
        <ChevronLeft className="h-4 w-4" /> All Orders
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Order #{order.id}</h1>
          <p className="text-sm text-slate-400 mt-0.5">Placed on {formatDate(order.createdAt)}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`text-sm font-semibold px-3 py-1.5 rounded-full ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
          {order.invoice && (
            <button
              onClick={() => invoicesApi.downloadPdf(order.id)}
              className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-violet-600 border border-slate-200 hover:border-violet-300 px-3 py-1.5 rounded-full transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Invoice
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => {
                if (confirm("Cancel this order?")) cancelMutation.mutate();
              }}
              disabled={cancelMutation.isPending}
              className="flex items-center gap-1.5 text-sm font-medium text-rose-500 hover:text-rose-600 border border-rose-200 hover:border-rose-300 px-3 py-1.5 rounded-full transition-colors disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" /> Cancel Order
            </button>
          )}
          {canReturn && (
            <button
              onClick={() => {
                if (confirm("Request return for this order?")) returnMutation.mutate();
              }}
              disabled={returnMutation.isPending}
              className="flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 border border-amber-200 hover:border-amber-300 px-3 py-1.5 rounded-full transition-colors disabled:opacity-60"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Return
            </button>
          )}
          {/* F2-12: Exchange */}
          {canReturn && (
            <button
              onClick={() => setShowExchangeForm(!showExchangeForm)}
              className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-300 px-3 py-1.5 rounded-full transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Exchange
            </button>
          )}
          {/* F2-13: Rate delivery */}
          {canReturn && !deliveryRating && (
            <button
              onClick={() => setShowRatingForm(!showRatingForm)}
              className="flex items-center gap-1.5 text-sm font-medium text-teal-600 hover:text-teal-700 border border-teal-200 hover:border-teal-300 px-3 py-1.5 rounded-full transition-colors"
            >
              <Star className="h-3.5 w-3.5" /> Rate Delivery
            </button>
          )}
          {canRefundToCard && (
            <button
              onClick={() => {
                if (confirm("Refund to original payment method?")) refundMutation.mutate();
              }}
              disabled={refundMutation.isPending}
              className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-300 px-3 py-1.5 rounded-full transition-colors disabled:opacity-60"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Refund to Card
            </button>
          )}
        </div>
      </div>

      {/* F2-13: Delivery Rating Form */}
      {showRatingForm && !deliveryRating && (
        <div className="bg-white rounded-3xl border border-slate-100 p-5 mb-6">
          <h3 className="font-semibold text-slate-800 mb-3">Rate your delivery experience</h3>
          <div className="flex gap-2 mb-3">
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => setRatingVal(n)}
                className={`p-2 rounded-full transition-colors ${ratingVal >= n ? "text-yellow-400" : "text-slate-200"}`}>
                <Star className="h-6 w-6 fill-current" />
              </button>
            ))}
          </div>
          <textarea
            value={ratingComment}
            onChange={(e) => setRatingComment(e.target.value)}
            placeholder="Tell us about your delivery experience..."
            className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-violet-300 mb-3 resize-none"
            rows={3}
          />
          <button onClick={submitRating} disabled={!ratingVal}
            className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors">
            Submit Feedback
          </button>
        </div>
      )}
      {deliveryRating && (
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 mb-6 text-sm">
          <div className="flex items-center gap-1 mb-1">
            {[1,2,3,4,5].map(n => <Star key={n} className={`h-4 w-4 ${deliveryRating.rating >= n ? "text-yellow-400 fill-yellow-400" : "text-slate-200"}`} />)}
          </div>
          <p className="text-slate-600">{deliveryRating.comment || "No comment"}</p>
        </div>
      )}

      {/* F2-12: Exchange Form */}
      {showExchangeForm && (
        <div className="bg-white rounded-3xl border border-slate-100 p-5 mb-6">
          <h3 className="font-semibold text-slate-800 mb-3">Request Exchange</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Select item to exchange</label>
              <select
                value={exchangeItemId ?? ""}
                onChange={(e) => setExchangeItemId(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
              >
                <option value="">Choose item...</option>
                {order.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.variant?.product?.name} — {item.variant?.size} / {item.variant?.color}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Replacement variant ID</label>
              <input
                type="number"
                value={exchangeVariantId ?? ""}
                onChange={(e) => setExchangeVariantId(Number(e.target.value))}
                placeholder="Enter variant ID for exchange"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Reason</label>
              <input
                value={exchangeReason}
                onChange={(e) => setExchangeReason(e.target.value)}
                placeholder="Why do you want to exchange?"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
          </div>
          <button onClick={submitExchange} disabled={!exchangeItemId || !exchangeVariantId || !exchangeReason}
            className="mt-3 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            Submit Exchange Request
          </button>
        </div>
      )}

      {/* Order Timeline */}
      {currentIdx >= 0 && (
        <div className="bg-white rounded-3xl border border-slate-100 p-5 mb-6">
          <div className="flex items-center justify-between relative">
            <div className="absolute top-5 left-0 right-0 h-0.5 bg-slate-100 z-0" />
            {ORDER_TIMELINE.map((step, i) => {
              const done = i <= currentIdx;
              const Icon = step.icon;
              return (
                <div key={step.status} className="relative z-10 flex flex-col items-center gap-1.5">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      done ? "bg-violet-600 text-white shadow-md shadow-violet-200" : "bg-slate-100 text-slate-300"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className={`text-[10px] font-medium hidden sm:block ${done ? "text-violet-600" : "text-slate-300"}`}>
                    {ORDER_STATUS_LABEL[step.status]?.label || step.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Shipment Tracking Timeline ─────────────────────────────────────── */}
      {order.trackingEvents && order.trackingEvents.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-100 p-5 mb-6">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Navigation className="h-4 w-4 text-violet-600" /> Shipment Tracking
          </h2>
          {(order.shipments ?? []).length > 0 && (order.shipments ?? []).some((s) => s.trackingCode) && (
            <div className="mb-4 flex flex-wrap gap-2">
              {(order.shipments ?? []).filter((s) => s.trackingCode).map((s) => (
                <span key={s.id} className="text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-3 py-1 font-medium">
                  Tracking: {s.trackingCode}
                </span>
              ))}
            </div>
          )}
          <div className="relative pl-6">
            <div className="absolute left-2 top-0 bottom-0 w-px bg-slate-100" />
            <div className="space-y-5">
              {[...order.trackingEvents].reverse().map((event, i: number) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="relative"
                >
                  <div className="absolute -left-4 top-1 w-2 h-2 rounded-full bg-violet-600 ring-2 ring-white" />
                  <p className="text-sm font-semibold text-slate-900">
                    {ORDER_STATUS_LABEL[event.status as string]?.label || event.status}
                  </p>
                  {event.note && (
                    <p className="text-xs text-slate-500 mt-0.5">{event.note}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5">{formatDate(event.createdAt)}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {/* ─── Order Items ─────────────────────────────────────────────────────── */}
        <div className="md:col-span-2 space-y-5">
          <div className="bg-white rounded-3xl border border-slate-100 p-5">
            <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Package className="h-4 w-4 text-violet-600" /> Order Items
            </h2>
            <div className="space-y-4">
              {order.items.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <Link href={`/products/${item.variant.product.id}`} className="relative w-16 h-20 flex-shrink-0 rounded-xl overflow-hidden bg-slate-50">
                    <Image
                      src={getProductImage(item.variant.product.images)}
                      alt={item.variant.product.name}
                      fill
                      className="object-cover"
                    />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link href={`/products/${item.variant.product.id}`} className="text-sm font-medium text-slate-900 hover:text-violet-600 transition-colors line-clamp-2">
                      {item.variant.product.name}
                    </Link>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Size: {item.variant.size} · Color: {item.variant.color} · Qty: {item.quantity}
                    </p>
                    <p className="text-sm font-bold text-slate-900 mt-1">{formatPrice(item.price * item.quantity)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Delivery Address */}
          {addr && (
            <div className="bg-white rounded-3xl border border-slate-100 p-5">
              <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-violet-600" /> Delivery Address
              </h2>
              <p className="text-sm font-semibold text-slate-900">{addr.fullName}</p>
              <p className="text-sm text-slate-500 mt-1">{addr.line1}{addr.line2 ? `, ${addr.line2}` : ""}</p>
              <p className="text-sm text-slate-500">{addr.city}, {addr.state} – {addr.pincode}</p>
              <p className="text-xs text-slate-400 mt-1">📞 {addr.phone}</p>
            </div>
          )}
        </div>

        {/* ─── Price Summary ────────────────────────────────────────────────────── */}
        <div className="space-y-5">
          <div className="bg-white rounded-3xl border border-slate-100 p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Price Details</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{formatPrice(order.subtotal)}</span>
              </div>
              {order.discountAmount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span className="flex items-center gap-1">
                    <Tag className="h-3 w-3" /> {order.couponCode || "Discount"}
                  </span>
                  <span>-{formatPrice(order.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600">
                <span>Shipping</span>
                {(order.shippingFee ?? 0) > 0
                  ? <span>{formatPrice(order.shippingFee)}</span>
                  : <span className="text-green-600 font-medium">FREE</span>
                }
              </div>
              {(order.taxAmount ?? 0) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>GST / Tax</span>
                  <span>{formatPrice(order.taxAmount)}</span>
                </div>
              )}
              {order.invoice && (
                <div className="flex justify-between text-slate-400 text-xs">
                  <span>Invoice</span>
                  <span>{order.invoice.invoiceNumber}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-slate-900 border-t border-slate-100 pt-3">
                <span>Total Paid</span>
                <span>{formatPrice(order.total)}</span>
              </div>
            </div>
          </div>

          <div className={`rounded-2xl p-4 text-sm font-medium ${
            order.paymentStatus === "PAID"
              ? "bg-green-50 text-green-700"
              : order.paymentStatus === "REFUNDED"
              ? "bg-blue-50 text-blue-700"
              : "bg-amber-50 text-amber-700"
          }`}>
            Payment: {order.paymentStatus}
          </div>
        </div>
      </div>
    </div>
  );
}
