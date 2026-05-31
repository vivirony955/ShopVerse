// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import Image from "next/image";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, ShoppingBag, Trash2, ArrowRight } from "lucide-react";
import toast from "react-hot-toast";
import { wishlistApi, cartApi } from "@/lib/api";
import { useWishlistStore, useCartStore } from "@/lib/store";
import { calcDiscountedPrice, formatPrice, getProductImage } from "@/lib/utils";
import { ProductCardSkeleton } from "@/components/ui/Skeleton";

export default function WishlistPage() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const { setFromServer } = useWishlistStore();
  const { openCart } = useCartStore();

  const { data: items, isLoading } = useQuery({
    queryKey: ["wishlist"],
    queryFn: async () => {
      const data = await wishlistApi.get();
      setFromServer(data);
      return data;
    },
    enabled: !!session,
  });

  const removeMutation = useMutation({
    mutationFn: (productId: number) => wishlistApi.remove(productId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wishlist"] });
      toast.success("Removed from wishlist");
    },
  });

  const addToCartMutation = useMutation({
    mutationFn: (variantId: number) => cartApi.addItem(variantId, 1),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cart"] });
      openCart();
    },
  });

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <Heart className="h-16 w-16 text-slate-200 mb-4" />
        <h2 className="text-xl font-bold text-slate-700">Your wishlist is empty</h2>
        <p className="text-slate-400 mt-1 text-sm">Sign in to save your favourite products</p>
        <Link
          href="/login"
          className="mt-6 px-8 py-3 bg-violet-600 text-white font-semibold rounded-full hover:bg-violet-700 transition-colors"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Wishlist</h1>
          {items && <p className="text-sm text-slate-400 mt-0.5">{items.length} saved items</p>}
        </div>
        <Link href="/products" className="text-sm font-medium text-violet-600 hover:underline flex items-center gap-1">
          Continue Shopping <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
        </div>
      ) : !items || items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Heart className="h-20 w-20 text-slate-100 mb-4" />
          <h2 className="text-lg font-semibold text-slate-700">No saved items yet</h2>
          <p className="text-slate-400 text-sm mt-1">Tap the heart on any product to save it here</p>
          <Link
            href="/products"
            className="mt-6 px-8 py-3 bg-violet-600 text-white font-semibold rounded-full hover:bg-violet-700 transition-colors"
          >
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          <AnimatePresence>
            {items.map((item, i) => {
              const product = item.product;
              const price = calcDiscountedPrice(product.basePrice, product.discountPct);
              const defaultVariant = product.variants[0];

              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2, delay: i * 0.04 }}
                  className="bg-white rounded-2xl overflow-hidden border border-slate-100 hover:shadow-lg hover:shadow-slate-100 transition-shadow group"
                >
                  <Link href={`/products/${product.id}`} className="relative block aspect-[3/4] bg-slate-50">
                    <Image
                      src={getProductImage(product.images)}
                      alt={product.name}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    {product.discountPct > 0 && (
                      <span className="absolute top-2 left-2 bg-rose-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        -{product.discountPct}%
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.preventDefault(); removeMutation.mutate(product.id); }}
                      className="absolute top-2 right-2 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow text-rose-400 hover:text-rose-600 hover:bg-white transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </Link>
                  <div className="p-3">
                    <p className="text-xs font-semibold text-violet-600 mb-0.5">{product.brand?.name}</p>
                    <Link href={`/products/${product.id}`}>
                      <p className="text-sm font-medium text-slate-800 line-clamp-2 hover:text-violet-600 transition-colors">{product.name}</p>
                    </Link>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-sm font-bold text-slate-900">{formatPrice(price)}</span>
                      {product.discountPct > 0 && (
                        <span className="text-xs text-slate-400 line-through">{formatPrice(product.basePrice)}</span>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        if (!defaultVariant) { toast.error("No variants available"); return; }
                        addToCartMutation.mutate(defaultVariant.id);
                      }}
                      disabled={!defaultVariant || addToCartMutation.isPending}
                      className="mt-3 w-full flex items-center justify-center gap-2 py-2 bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50"
                    >
                      <ShoppingBag className="h-3.5 w-3.5" /> Add to Bag
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
