// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart, ShoppingBag, ChevronLeft, ChevronRight, X,
  Truck, RotateCcw, Shield, Share2, Tag, Check, TrendingUp, Package, Bell, BellOff, MessageSquare,
} from "lucide-react";
import toast from "react-hot-toast";
import { productsApi, cartApi, wishlistApi, reviewsApi, faqsApi, deliverySlotsApi, qaApi, priceAlertsApi, priceHistoryApi, volumeDiscountsApi } from "@/lib/api";
import { useWishlistStore, useRecentlyViewedStore } from "@/lib/store";
import { calcDiscountedPrice, formatPrice, formatDate, getProductImage } from "@/lib/utils";
import Rating from "@/components/ui/Rating";
import { PageSkeleton } from "@/components/ui/Skeleton";
import ProductCard from "@/components/product/ProductCard";
import { ProductJsonLd, BreadcrumbJsonLd, FaqPageJsonLd } from "@/components/seo/JsonLd";

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = Number(params?.id);
  const { data: session } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const { has, addId, removeId } = useWishlistStore();
  const { push: pushRecentlyViewed } = useRecentlyViewedStore();

  const [activeImage, setActiveImage] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: "", body: "" });
  const [showReviewForm, setShowReviewForm] = useState(false);

  // F1-05: Image zoom on hover
  const [isZooming, setIsZooming] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  const [showSizeChart, setShowSizeChart] = useState(false);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const handleImageMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPos({ x, y });
  }, []);

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", productId],
    queryFn: () => productsApi.getOne(productId),
    enabled: !isNaN(productId),
  });

  // Track recently viewed after product loads
  useEffect(() => {
    if (product) pushRecentlyViewed(product);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  const { data: reviewData } = useQuery({
    queryKey: ["reviews", productId],
    queryFn: () => reviewsApi.getForProduct(productId),
    enabled: !isNaN(productId),
  });

  // FAQs
  const { data: faqs } = useQuery({
    queryKey: ["faqs", productId],
    queryFn: () => faqsApi.getForProduct(productId),
    enabled: !isNaN(productId),
  });

  // Delivery slots for today
  const todayStr = new Date().toISOString().split("T")[0];
  const { data: deliverySlots } = useQuery({
    queryKey: ["delivery-slots", todayStr],
    queryFn: () => deliverySlotsApi.getAvailable(todayStr),
    staleTime: 5 * 60 * 1000,
  });

  // F1-06: Size chart for this product's category
  const { data: sizeChart } = useQuery({
    queryKey: ["size-chart", product?.category?.id],
    queryFn: () => productsApi.getSizeChart(product!.category!.id),
    enabled: !!product?.category?.id,
    staleTime: 30 * 60 * 1000,
  });

  // F2-14: Customer Q&A
  const { data: qaItems } = useQuery({
    queryKey: ["qa", productId],
    queryFn: () => qaApi.getForProduct(productId),
    enabled: !isNaN(productId),
  });

  // F2-17: Price drop alert for this user/product
  const { data: myAlerts } = useQuery({
    queryKey: ["price-alert", productId],
    queryFn: () => priceAlertsApi.getAll(),
    enabled: !!session,
  });
  const hasAlert = myAlerts?.some((a: any) => a.productId === productId && !a.isTriggered) ?? false;

  // F3-12: Price history
  const { data: priceHistory } = useQuery({
    queryKey: ["price-history", productId],
    queryFn: () => priceHistoryApi.get(productId, 30),
    enabled: !isNaN(productId),
  });

  // F4-08: Volume discounts
  const { data: volumeDiscounts } = useQuery({
    queryKey: ["volume-discounts", productId],
    queryFn: () => volumeDiscountsApi.getForProduct(productId),
    enabled: !isNaN(productId),
  });

  // Q&A state
  const [qaQuestion, setQaQuestion] = useState("");
  const [qaSubmitting, setQaSubmitting] = useState(false);
  const qc2 = useQueryClient();

  async function submitQuestion() {
    if (!qaQuestion.trim() || !session) return;
    setQaSubmitting(true);
    try {
      await qaApi.ask(productId, qaQuestion.trim());
      setQaQuestion("");
      qc2.invalidateQueries({ queryKey: ["qa", productId] });
      toast.success("Question submitted! It will appear after moderation.");
    } catch { toast.error("Failed to submit question"); }
    finally { setQaSubmitting(false); }
  }

  async function togglePriceAlert() {
    if (!session) { router.push("/login"); return; }
    if (hasAlert) {
      await priceAlertsApi.delete(productId);
      qc2.invalidateQueries({ queryKey: ["price-alert", productId] });
      toast.success("Price alert removed");
    } else {
      const effectivePrice = product ? product.basePrice * (1 - product.discountPct / 100) : 0;
      await priceAlertsApi.set(productId, Math.round(effectivePrice * 0.9 * 100) / 100);
      qc2.invalidateQueries({ queryKey: ["price-alert", productId] });
      toast.success("Alert set! We'll email you when price drops 10%.");
    }
  }

  // Cross-sell / upsell queries (enabled once productId is valid)
  const { data: relatedProducts } = useQuery({
    queryKey: ["related", productId],
    queryFn: () => productsApi.getRelated(productId, 4),
    enabled: !isNaN(productId) && !!product,
    staleTime: 5 * 60 * 1000,
  });

  const { data: fbtProducts } = useQuery({
    queryKey: ["fbt", productId],
    queryFn: () => productsApi.getFrequentlyBoughtTogether(productId, 4),
    enabled: !isNaN(productId) && !!product,
    staleTime: 5 * 60 * 1000,
  });

  const { data: upsellProducts } = useQuery({
    queryKey: ["upsells", productId],
    queryFn: () => productsApi.getUpsells(productId, 4),
    enabled: !isNaN(productId) && !!product,
    staleTime: 5 * 60 * 1000,
  });

  const addAllToCartMutation = useMutation({
    mutationFn: async (variantIds: number[]) => {
      for (const vid of variantIds) {
        await cartApi.addItem(vid, 1);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cart"] });
      toast.success("All items added to bag!");
    },
    onError: () => toast.error("Failed to add some items"),
  });

  const addToCartMutation = useMutation({
    mutationFn: () => {
      if (!selectedVariant) throw new Error("select");
      return cartApi.addItem(selectedVariant, qty);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cart"] });
      toast.success("Added to bag!");
    },
    onError: (err: any) => {
      if (err.message === "select") {
        toast.error("Please select a size / variant");
      } else {
        toast.error(err?.response?.data?.message || "Failed to add");
      }
    },
  });

  const wishlistMutation = useMutation({
    mutationFn: () =>
      has(productId) ? wishlistApi.remove(productId) : wishlistApi.add(productId),
    onMutate: () => {
      has(productId) ? removeId(productId) : addId(productId);
    },
    onError: () => {
      has(productId) ? addId(productId) : removeId(productId);
      toast.error("Something went wrong");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wishlist"] });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: () => reviewsApi.create(productId, reviewForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews", productId] });
      setShowReviewForm(false);
      setReviewForm({ rating: 5, title: "", body: "" });
      toast.success("Review submitted!");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to submit review");
    },
  });

  if (isLoading) return <PageSkeleton />;
  if (!product) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-400">
      <p className="text-5xl mb-4">😕</p>
      <p className="text-lg font-medium">Product not found</p>
      <Link href="/products" className="mt-4 text-violet-600 hover:underline text-sm">
        Browse all products
      </Link>
    </div>
  );

  const discountedPrice = calcDiscountedPrice(product.basePrice, product.discountPct);
  const hasDiscount = product.discountPct > 0;
  const images = product.images.length > 0 ? product.images : [getProductImage([])];

  // Group variants by size
  const sizeMap = new Map<string, typeof product.variants>();
  product.variants.forEach((v) => {
    if (!sizeMap.has(v.size)) sizeMap.set(v.size, []);
    sizeMap.get(v.size)!.push(v);
  });

  const selectedVariantObj = product.variants.find((v) => v.id === selectedVariant);
  const isInStock = selectedVariantObj ? selectedVariantObj.stock > 0 : product.variants.some((v) => v.stock > 0);

  return (
    <>
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-400 mb-6">
        <Link href="/" className="hover:text-violet-600 transition-colors">Home</Link>
        <span>/</span>
        <Link href="/products" className="hover:text-violet-600 transition-colors">Products</Link>
        {product.category && (
          <>
            <span>/</span>
            <Link href={`/products?category=${product.category.slug}`} className="hover:text-violet-600 transition-colors capitalize">
              {product.category.name}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-slate-600 line-clamp-1">{product.name}</span>
      </nav>

      <div className="grid lg:grid-cols-2 gap-12">
        {/* ─── Images ──────────────────────────────────────────────────────────── */}
        <div>
          <div
            ref={imageContainerRef}
            className="relative aspect-[3/4] rounded-3xl overflow-hidden bg-slate-50 mb-3 cursor-crosshair"
            onMouseEnter={() => setIsZooming(true)}
            onMouseLeave={() => setIsZooming(false)}
            onMouseMove={handleImageMouseMove}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeImage}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0"
                style={isZooming ? {
                  transform: 'scale(2)',
                  transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`,
                  transition: 'transform-origin 0.1s ease',
                } : undefined}
              >
                <Image
                  src={images[activeImage]}
                  alt={product.name}
                  fill
                  className="object-cover"
                  priority
                />
              </motion.div>
            </AnimatePresence>

            {hasDiscount && (
              <div className="absolute top-4 left-4 bg-rose-500 text-white text-sm font-bold px-3 py-1 rounded-full">
                -{product.discountPct}%
              </div>
            )}

            {/* Nav arrows */}
            {images.length > 1 && (
              <>
                <button
                  onClick={() => setActiveImage((i) => (i - 1 + images.length) % images.length)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/90 rounded-full flex items-center justify-center shadow-md hover:bg-white transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setActiveImage((i) => (i + 1) % images.length)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/90 rounded-full flex items-center justify-center shadow-md hover:bg-white transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}
          </div>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImage(i)}
                  className={`relative w-16 h-20 flex-shrink-0 rounded-xl overflow-hidden border-2 transition-all ${
                    i === activeImage ? "border-violet-600" : "border-transparent"
                  }`}
                >
                  <Image src={img} alt="" fill className="object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ─── Info ────────────────────────────────────────────────────────────── */}
        <div>
          {product.brand && (
            <Link
              href={`/products?brand=${product.brand.slug}`}
              className="text-sm font-semibold text-violet-600 hover:underline uppercase tracking-wide"
            >
              {product.brand.name}
            </Link>
          )}
          <h1 className="text-2xl font-bold text-slate-900 mt-1 mb-3">{product.name}</h1>

          {/* Social proof */}
          {(product.variants?.[0]?.soldCount ?? 0) > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-50 text-green-700 px-2.5 py-1 rounded-full">
                🔥 {product.variants!.reduce((s, v) => s + (v.soldCount ?? 0), 0).toLocaleString()} sold
              </span>
              {(product.variants?.reduce((s, v) => s + v.stock, 0) ?? 0) <= 10 &&
                (product.variants?.reduce((s, v) => s + v.stock, 0) ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium bg-orange-50 text-orange-600 px-2.5 py-1 rounded-full">
                    ⚡ Only {product.variants!.reduce((s, v) => s + v.stock, 0)} left
                  </span>
                )}
            </div>
          )}

          {/* Rating */}
          {reviewData && reviewData.total > 0 && (
            <div className="flex items-center gap-2 mb-4">
              <Rating value={reviewData.avgRating} />
              <span className="text-sm font-medium text-slate-700">{reviewData.avgRating.toFixed(1)}</span>
              <span className="text-sm text-slate-400">({reviewData.total} reviews)</span>
            </div>
          )}

          {/* Price */}
          <div className="flex items-baseline gap-3 mb-6">
            <span className="text-3xl font-bold text-slate-900">{formatPrice(discountedPrice)}</span>
            {hasDiscount && (
              <span className="text-lg text-slate-400 line-through">{formatPrice(product.basePrice)}</span>
            )}
            {hasDiscount && (
              <span className="text-sm font-semibold text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full">
                {product.discountPct}% off
              </span>
            )}
          </div>

          {/* Size selector */}
          {product.variants.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-slate-900">
                  {selectedVariantObj ? `Size: ${selectedVariantObj.size}` : "Select Size"}
                </p>
                {sizeChart && (
                  <button
                    onClick={() => setShowSizeChart(true)}
                    className="text-xs text-violet-600 hover:underline"
                  >
                    Size Guide
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {[...sizeMap.entries()].map(([size, variants]) => {
                  const inStock = variants.some((v) => v.stock > 0);
                  const variantId = variants[0].id;
                  return (
                    <button
                      key={size}
                      onClick={() => inStock && setSelectedVariant(variantId === selectedVariant ? null : variantId)}
                      disabled={!inStock}
                      className={`px-4 py-2 text-sm font-medium rounded-xl border-2 transition-all ${
                        selectedVariant === variantId
                          ? "border-violet-600 bg-violet-50 text-violet-700"
                          : inStock
                          ? "border-slate-200 text-slate-700 hover:border-violet-300"
                          : "border-slate-100 text-slate-300 line-through cursor-not-allowed"
                      }`}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantity */}
          <div className="flex items-center gap-4 mb-6">
            <p className="text-sm font-semibold text-slate-900">Qty:</p>
            <div className="flex items-center gap-2 bg-slate-100 rounded-full p-1">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white transition-colors font-bold text-slate-700"
              >
                −
              </button>
              <span className="w-8 text-center font-semibold">{qty}</span>
              <button
                onClick={() => setQty((q) => Math.min(10, q + 1))}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white transition-colors font-bold text-slate-700"
              >
                +
              </button>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => {
                if (!session) { router.push("/login"); return; }
                addToCartMutation.mutate();
              }}
              disabled={!isInStock || addToCartMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-all duration-200 hover:shadow-lg hover:shadow-violet-200 active:scale-[0.98]"
            >
              {addToCartMutation.isPending ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <ShoppingBag className="h-4 w-4" />
                  {isInStock ? "Add to Bag" : "Out of Stock"}
                </>
              )}
            </button>

            <button
              onClick={() => {
                if (!session) { router.push("/login"); return; }
                wishlistMutation.mutate();
              }}
              className={`p-3.5 rounded-2xl border-2 transition-all duration-200 ${
                has(productId)
                  ? "border-rose-400 bg-rose-50 text-rose-500"
                  : "border-slate-200 text-slate-500 hover:border-rose-300 hover:text-rose-400"
              }`}
            >
              <Heart className={`h-5 w-5 ${has(productId) ? "fill-rose-400" : ""}`} />
            </button>

            <button
              onClick={async () => {
                const url = window.location.href;
                const text = `Check out ${product.name} on ShopVerse!`;
                if (navigator.share) {
                  try { await navigator.share({ title: product.name, text, url }); return; } catch { /* fallthrough */ }
                }
                // Fallback: copy link + show toast with share options
                await navigator.clipboard.writeText(url).catch(() => {});
                toast((t) => (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">Share this product</p>
                    <div className="flex gap-2 flex-wrap">
                      <a href={`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-green-500 text-white text-xs rounded-full">WhatsApp</a>
                      <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-sky-500 text-white text-xs rounded-full">Twitter</a>
                      <button onClick={() => toast.dismiss(t.id)} className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs rounded-full">Link copied ✓</button>
                    </div>
                  </div>
                ), { duration: 5000 });
              }}
              className="p-3.5 rounded-2xl border-2 border-slate-200 text-slate-500 hover:border-violet-300 hover:text-violet-500 transition-all"
            >
              <Share2 className="h-5 w-5" />
            </button>
          </div>

          {/* F2-17: Price drop alert */}
          <button
            onClick={togglePriceAlert}
            className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-full border transition-all mb-4 ${
              hasAlert ? "border-amber-400 text-amber-600 bg-amber-50" : "border-slate-200 text-slate-600 hover:border-amber-300 hover:text-amber-500"
            }`}
          >
            {hasAlert ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            {hasAlert ? "Remove price alert" : "Alert me when price drops"}
          </button>

          {/* F4-08: Volume discounts */}
          {volumeDiscounts && volumeDiscounts.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 text-sm">
              <p className="font-semibold text-green-800 mb-1">Bulk Discounts</p>
              <ul className="space-y-1">
                {volumeDiscounts.map((d: any) => (
                  <li key={d.id} className="text-green-700">Buy {d.minQty}+ → <strong>{d.discountPct}% off</strong></li>
                ))}
              </ul>
            </div>
          )}

          {/* Offers */}
          {product.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {product.tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 bg-violet-50 px-2.5 py-1 rounded-full">
                  <Tag className="h-3 w-3" /> {tag}
                </span>
              ))}
            </div>
          )}

          {/* Trust badges */}
          <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 rounded-2xl mb-5">
            {[
              { icon: Truck, text: "Free delivery above ₹499" },
              { icon: RotateCcw, text: "30-day easy returns" },
              { icon: Shield, text: "100% secure checkout" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex flex-col items-center text-center gap-1">
                <Icon className="h-5 w-5 text-violet-500" />
                <p className="text-xs text-slate-500">{text}</p>
              </div>
            ))}
          </div>

          {/* Description */}
          {product.description && (
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Product Description</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{product.description}</p>
            </div>
          )}

          {/* Delivery estimate */}
          {deliverySlots && deliverySlots.length > 0 && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-4 py-3 mb-5">
              <Truck className="h-4 w-4 text-green-600 flex-shrink-0" />
              <p className="text-sm text-green-700">
                <span className="font-semibold">Express delivery available</span> — next slot:{" "}
                {deliverySlots[0].slotLabel}
              </p>
            </div>
          )}

          {/* F1-07: Product Specifications */}
          {product?.specifications && Object.keys(product.specifications as Record<string, string>).length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Product Details</h3>
              <table className="w-full text-sm border-collapse">
                <tbody>
                  {Object.entries(product.specifications as Record<string, string>).map(([key, val], i) => (
                    <tr key={key} className={i % 2 === 0 ? "bg-slate-50" : ""}>
                      <td className="px-3 py-2 text-slate-500 font-medium w-2/5 capitalize">{key}</td>
                      <td className="px-3 py-2 text-slate-800">{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* F1-10: Product Videos */}
          {product?.videos && (product.videos as string[]).length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Product Videos</h3>
              <div className="space-y-3">
                {(product.videos as string[]).map((url: string, i: number) => (
                  <video
                    key={i}
                    src={url}
                    controls
                    className="w-full rounded-xl bg-black max-h-64 object-contain"
                  />
                ))}
              </div>
            </div>
          )}

          {/* FAQs */}
          {faqs && faqs.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Frequently Asked Questions</h3>
              <div className="space-y-2">
                {faqs.map((faq: { id: number; question: string; answer: string }) => (
                  <details key={faq.id} className="group bg-slate-50 rounded-xl">
                    <summary className="flex items-center justify-between px-4 py-3 cursor-pointer text-sm font-medium text-slate-800 list-none">
                      {faq.question}
                      <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <div className="px-4 pb-3 text-sm text-slate-600 leading-relaxed">
                      {faq.answer}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── F3-12: Price History Chart ──────────────────────────────────────────── */}
      {priceHistory && priceHistory.length > 1 && (
        <section className="mt-16">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Price History (30 days)</h2>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 overflow-x-auto">
            <div className="flex items-end gap-1 h-24 min-w-0">
              {priceHistory.map((h: any, i: number) => {
                const max = Math.max(...priceHistory.map((x: any) => x.price));
                const min = Math.min(...priceHistory.map((x: any) => x.price));
                const range = max - min || 1;
                const heightPct = ((h.price - min) / range) * 100;
                const barH = Math.max(8, (heightPct / 100) * 80);
                const effectivePrice = h.price * (1 - h.discountPct / 100);
                return (
                  <div key={i} title={`₹${effectivePrice.toFixed(0)} on ${new Date(h.recordedAt).toLocaleDateString("en-IN")}`}
                    className="flex-1 bg-violet-200 rounded-t hover:bg-violet-400 transition-colors cursor-pointer"
                    style={{ height: `${barH}px` }}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>{new Date(priceHistory[0].recordedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
              <span>{new Date(priceHistory[priceHistory.length - 1].recordedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
            </div>
          </div>
        </section>
      )}

      {/* ─── F2-14: Customer Q&A ─────────────────────────────────────────────────── */}
      <section className="mt-16">
        <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-violet-500" /> Customer Q&amp;A
        </h2>
        {qaItems && qaItems.length > 0 && (
          <div className="space-y-4 mb-6">
            {qaItems.map((q: any) => (
              <div key={q.id} className="bg-slate-50 rounded-xl p-4">
                <p className="text-sm font-semibold text-slate-800">Q: {q.question}</p>
                {q.answer && (
                  <p className="text-sm text-slate-600 mt-2 pl-3 border-l-2 border-violet-300">A: {q.answer}</p>
                )}
                <p className="text-xs text-slate-400 mt-2">
                  {q.user?.firstName ? `Asked by ${q.user.firstName}` : "Anonymous"} · {new Date(q.createdAt).toLocaleDateString("en-IN")}
                </p>
              </div>
            ))}
          </div>
        )}
        {session ? (
          <div className="flex gap-3">
            <input
              value={qaQuestion}
              onChange={(e) => setQaQuestion(e.target.value)}
              placeholder="Ask a question about this product..."
              className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
              onKeyDown={(e) => e.key === "Enter" && submitQuestion()}
            />
            <button
              onClick={submitQuestion}
              disabled={qaSubmitting || !qaQuestion.trim()}
              className="px-4 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              Ask
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-500"><Link href="/login" className="text-violet-600 hover:underline">Sign in</Link> to ask a question</p>
        )}
      </section>

      {/* ─── Reviews ─────────────────────────────────────────────────────────────── */}
      <section className="mt-16">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Customer Reviews</h2>
            {reviewData && (
              <div className="flex items-center gap-2 mt-1">
                <Rating value={reviewData.avgRating} />
                <span className="text-sm text-slate-500">{reviewData.avgRating.toFixed(1)} · {reviewData.total} reviews</span>
              </div>
            )}
          </div>
          {session && (
            <button
              onClick={() => setShowReviewForm(!showReviewForm)}
              className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-full hover:bg-violet-700 transition-colors"
            >
              {showReviewForm ? "Cancel" : "Write a Review"}
            </button>
          )}
        </div>

        {/* Review form */}
        <AnimatePresence>
          {showReviewForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-violet-50 rounded-2xl p-5 mb-6 overflow-hidden"
            >
              <h3 className="font-semibold text-slate-900 mb-4">Your Review</h3>
              <div className="mb-3">
                <label className="text-sm font-medium text-slate-700 mb-1 block">Rating</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((r) => (
                    <button
                      key={r}
                      onClick={() => setReviewForm((f) => ({ ...f, rating: r }))}
                      className={`text-2xl transition-transform hover:scale-110 ${r <= reviewForm.rating ? "text-amber-400" : "text-slate-200"}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                placeholder="Review title (optional)"
                value={reviewForm.title}
                onChange={(e) => setReviewForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 mb-3 bg-white"
              />
              <textarea
                placeholder="Share your experience..."
                value={reviewForm.body}
                onChange={(e) => setReviewForm((f) => ({ ...f, body: e.target.value }))}
                rows={4}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 mb-3 bg-white resize-none"
              />
              <button
                onClick={() => reviewMutation.mutate()}
                disabled={reviewMutation.isPending}
                className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-full hover:bg-violet-700 transition-colors disabled:opacity-60"
              >
                {reviewMutation.isPending ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <><Check className="h-4 w-4" /> Submit Review</>
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Review list */}
        <div className="space-y-4">
          {reviewData?.reviews.length === 0 && (
            <p className="text-slate-400 text-sm py-8 text-center">No reviews yet. Be the first to review!</p>
          )}
          {reviewData?.reviews.map((review) => (
            <div key={review.id} className="bg-white border border-slate-100 rounded-2xl p-5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {[review.user.firstName, review.user.lastName].filter(Boolean).join(" ") || "Anonymous"}
                    </p>
                    {review.isVerifiedPurchase && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                        <Check className="h-3 w-3" /> Verified Purchase
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">{formatDate(review.createdAt)}</p>
                </div>
                <Rating value={review.rating} />
              </div>
              {review.title && <p className="text-sm font-medium text-slate-800 mb-1">{review.title}</p>}
              {review.body && <p className="text-sm text-slate-600 leading-relaxed">{review.body}</p>}
              {/* F1-09: Helpful voting */}
              {session && session.user && (review as any).userId !== (session.user as any).id && (
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs text-slate-400">Helpful?</span>
                  <button
                    onClick={() => reviewsApi.vote(review.id, true).then(() => qc.invalidateQueries({ queryKey: ["reviews", productId] }))}
                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-600 transition-colors"
                  >
                    👍 {(review.helpfulCount ?? 0) > 0 && <span>{review.helpfulCount}</span>}
                    Yes
                  </button>
                  <button
                    onClick={() => reviewsApi.vote(review.id, false).then(() => qc.invalidateQueries({ queryKey: ["reviews", productId] }))}
                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-500 transition-colors"
                  >
                    👎 No
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ─── Frequently Bought Together ─────────────────────────────────────────── */}
      {fbtProducts && fbtProducts.length > 0 && (
        <section className="mt-16">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-violet-600" />
              <h2 className="text-xl font-bold text-slate-900">Frequently Bought Together</h2>
            </div>
            <button
              onClick={() => {
                if (!session) { router.push("/login"); return; }
                const firstVariantIds = fbtProducts
                  .map((p) => p.variants?.find((v) => v.stock > 0)?.id)
                  .filter(Boolean) as number[];
                if (firstVariantIds.length) addAllToCartMutation.mutate(firstVariantIds);
              }}
              disabled={addAllToCartMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-violet-50 hover:bg-violet-100 text-violet-700 text-sm font-medium rounded-full transition-colors disabled:opacity-60"
            >
              {addAllToCartMutation.isPending ? (
                <div className="w-3.5 h-3.5 border-2 border-violet-300 border-t-violet-700 rounded-full animate-spin" />
              ) : (
                <ShoppingBag className="h-3.5 w-3.5" />
              )}
              Add all to bag
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {fbtProducts.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* ─── Upgrade Your Choice (Upsells) ──────────────────────────────────────── */}
      {upsellProducts && upsellProducts.length > 0 && (
        <section className="mt-16">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="h-5 w-5 text-amber-500" />
            <h2 className="text-xl font-bold text-slate-900">Upgrade Your Choice</h2>
            <span className="ml-2 text-xs bg-amber-50 text-amber-600 border border-amber-200 rounded-full px-2.5 py-0.5 font-medium">
              Premium options
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {upsellProducts.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* ─── Related Products ────────────────────────────────────────────────────── */}
      {relatedProducts && relatedProducts.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl font-bold text-slate-900 mb-6">You May Also Like</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {relatedProducts.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* ─── Recently Viewed ──────────────────────────────────────────────────────── */}
      <RecentlyViewedSection currentId={productId} />
    </div>

    {/* ─── Sticky ATC bar (mobile) ───────────────────────────────────────────── */}
    <div className="fixed bottom-0 inset-x-0 z-30 sm:hidden bg-white border-t border-slate-100 px-4 py-3 flex items-center gap-3 shadow-xl shadow-slate-200/80">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 truncate">{product.name}</p>
        <p className="text-sm font-bold text-slate-900">{formatPrice(discountedPrice)}</p>
      </div>
      <button
        onClick={() => {
          if (!session) { router.push("/login"); return; }
          addToCartMutation.mutate();
        }}
        disabled={!isInStock || addToCartMutation.isPending}
        className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold rounded-full transition-colors whitespace-nowrap"
      >
        {addToCartMutation.isPending ? (
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <><ShoppingBag className="h-4 w-4" /> {isInStock ? "Add to Bag" : "Out of Stock"}</>
        )}
      </button>
    </div>

    {/* F1-06: Size Chart Modal */}
    <AnimatePresence>
      {showSizeChart && sizeChart && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowSizeChart(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-auto p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">{sizeChart.title || "Size Guide"}</h3>
              <button
                onClick={() => setShowSizeChart(false)}
                className="p-1 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-3">All measurements in {sizeChart.unit || "cm"}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    {sizeChart.data?.length > 0 && Object.keys(sizeChart.data[0]).map((key: string) => (
                      <th key={key} className="px-3 py-2 text-left font-semibold text-slate-700 capitalize">
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(sizeChart.data as Record<string, string | number>[])?.map((row: Record<string, string | number>, i: number) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-slate-50" : ""}>
                      {Object.values(row).map((val, j) => (
                        <td key={j} className="px-3 py-2 text-slate-600">
                          {val}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* F1-13: Structured data */}
    <ProductJsonLd
      product={product}
      avgRating={(product as any).avgRating}
      reviewCount={(product as any).reviewCount}
    />
    {product.category && (
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/` },
          { name: "Products", url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/products` },
          { name: product.category.name, url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/products?category=${product.category.slug}` },
          { name: product.name, url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/products/${product.id}` },
        ]}
      />
    )}
    {faqs && faqs.length > 0 && <FaqPageJsonLd faqs={faqs} />}
    </>
  );
}

function RecentlyViewedSection({ currentId }: { currentId: number }) {
  const { products } = useRecentlyViewedStore();
  const others = products.filter((p) => p.id !== currentId).slice(0, 4);
  if (others.length === 0) return null;
  return (
    <section className="mt-16">
      <h2 className="text-xl font-bold text-slate-900 mb-6">Recently Viewed</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {others.map((p, i) => (
          <ProductCard key={p.id} product={p} index={i} />
        ))}
      </div>
    </section>
  );
}
