// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import Image from "next/image";
import Link from "next/link";
import { Heart, ShoppingBag, Eye } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import type { Product } from "@/types";
import { calcDiscountedPrice, formatPrice, getProductImage } from "@/lib/utils";
import { cartApi, wishlistApi } from "@/lib/api";
import { useCartStore, useWishlistStore, useCompareStore } from "@/lib/store";
import Badge from "@/components/ui/Badge";
import Rating from "@/components/ui/Rating";
import { GitCompareArrows } from "lucide-react";

interface ProductCardProps {
  product: Product;
  index?: number;
}

export default function ProductCard({ product, index = 0 }: ProductCardProps) {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const { openCart, setItems } = useCartStore();
  const { has, addId, removeId } = useWishlistStore();
  const { add: addCompare, remove: removeCompare, has: inCompare } = useCompareStore();
  const [hovered, setHovered] = useState(false);

  const discounted = calcDiscountedPrice(product.basePrice, product.discountPct);
  const hasDiscount = product.discountPct > 0;
  const inWishlist = has(product.id);
  const comparing = inCompare(product.id);
  const firstVariant = product.variants?.[0];
  const isOutOfStock = product.variants?.every((v) => v.stock === 0);
  const totalStock = product.variants?.reduce((s, v) => s + v.stock, 0) ?? 0;
  const isLowStock = !isOutOfStock && totalStock > 0 && totalStock <= 5;

  // ─── Add to cart ─────────────────────────────────────────────────────────────
  const cartMutation = useMutation({
    mutationFn: () => {
      if (!firstVariant) throw new Error("No variant available");
      return cartApi.addItem(firstVariant.id, 1);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cart"] });
      cartApi.get().then((cart) => { setItems(cart.items); openCart(); });
      toast.success("Added to bag!");
    },
    onError: () => toast.error("Could not add to bag"),
  });

  // ─── Wishlist toggle ─────────────────────────────────────────────────────────
  const wishlistMutation = useMutation({
    mutationFn: () =>
      inWishlist ? wishlistApi.remove(product.id) : wishlistApi.add(product.id),
    onMutate: () => {
      inWishlist ? removeId(product.id) : addId(product.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wishlist"] });
      toast.success(inWishlist ? "Removed from wishlist" : "Saved to wishlist");
    },
    onError: () => {
      // revert optimistic
      inWishlist ? addId(product.id) : removeId(product.id);
      if (!session) toast.error("Please login to save items");
    },
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="group relative bg-white rounded-2xl overflow-hidden border border-slate-100 hover:border-violet-200 hover:shadow-xl hover:shadow-violet-50 transition-all duration-300"
    >
      {/* Image */}
      <Link href={`/products/${product.id}`} className="block">
        <div className="relative aspect-[3/4] product-image-zoom bg-slate-50">
          <Image
            src={getProductImage(product.images)}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover"
          />

          {/* Badges */}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5">
            {hasDiscount && (
              <Badge variant="sale">{product.discountPct}% OFF</Badge>
            )}
            {isOutOfStock && <Badge variant="out">Out of Stock</Badge>}
            {isLowStock && (
              <span className="text-[10px] font-bold px-2 py-0.5 bg-orange-500 text-white rounded-full">
                Only {totalStock} left!
              </span>
            )}
          </div>

          {/* Quick actions overlay */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: hovered ? 1 : 0, y: hovered ? 0 : 8 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-3 inset-x-3 flex gap-2"
          >
            <button
              onClick={(e) => {
                e.preventDefault();
                if (!isOutOfStock) cartMutation.mutate();
              }}
              disabled={isOutOfStock || cartMutation.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 bg-white/95 backdrop-blur-sm text-slate-900 text-xs font-semibold py-2.5 rounded-full hover:bg-violet-600 hover:text-white transition-colors duration-200 shadow-sm disabled:opacity-50"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              {isOutOfStock ? "Out of Stock" : "Quick Add"}
            </button>
            <Link
              href={`/products/${product.id}`}
              className="flex items-center justify-center w-10 h-10 bg-white/95 backdrop-blur-sm rounded-full hover:bg-violet-600 hover:text-white text-slate-700 transition-colors duration-200 shadow-sm"
            >
              <Eye className="h-4 w-4" />
            </Link>
          </motion.div>
        </div>
      </Link>

      {/* Wishlist + Compare buttons */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5">
        <button
          onClick={() => wishlistMutation.mutate()}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-white/90 backdrop-blur-sm shadow-sm hover:scale-110 transition-transform duration-200"
        >
          <Heart
            className={`h-4 w-4 transition-colors duration-200 ${
              inWishlist ? "fill-rose-500 text-rose-500" : "text-slate-400"
            }`}
          />
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            comparing ? removeCompare(product.id) : addCompare(product);
          }}
          title={comparing ? "Remove from compare" : "Add to compare"}
          className={`w-8 h-8 flex items-center justify-center rounded-full bg-white/90 backdrop-blur-sm shadow-sm hover:scale-110 transition-transform duration-200 ${
            comparing ? "text-violet-600" : "text-slate-400"
          }`}
        >
          <GitCompareArrows className="h-4 w-4" />
        </button>
      </div>

      {/* Info */}
      <Link href={`/products/${product.id}`} className="block p-4">
        <p className="text-xs font-medium text-violet-600 mb-1">{product.brand?.name}</p>
        <h3 className="text-sm font-medium text-slate-900 line-clamp-2 leading-snug mb-2">
          {product.name}
        </h3>

        {/* Rating */}
        {product.reviews && product.reviews.length > 0 && (
          <div className="flex items-center gap-1 mb-2">
            <Rating
              value={
                product.reviews.reduce((s, r) => s + r.rating, 0) /
                product.reviews.length
              }
            />
            <span className="text-xs text-slate-400">({product.reviews.length})</span>
          </div>
        )}

        {/* Price */}
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-slate-900">
            {formatPrice(discounted)}
          </span>
          {hasDiscount && (
            <span className="text-xs text-slate-400 line-through">
              {formatPrice(product.basePrice)}
            </span>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
