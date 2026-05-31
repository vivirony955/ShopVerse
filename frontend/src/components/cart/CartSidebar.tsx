// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { X, Minus, Plus, Trash2, ShoppingBag, Bookmark, ShoppingCart } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { cartApi, experienceApi } from "@/lib/api";
import { useCartStore } from "@/lib/store";
import { calcDiscountedPrice, formatPrice, getProductImage } from "@/lib/utils";

export default function CartSidebar() {
  const { data: session } = useSession();
  const { isOpen, closeCart, setItems, itemCount, totalPrice } = useCartStore();
  const qc = useQueryClient();

  // Fetch cart from server whenever sidebar opens
  const { data: cart, isLoading } = useQuery({
    queryKey: ["cart"],
    queryFn: async () => {
      const data = await cartApi.get();
      setItems(data.items);
      return data;
    },
    enabled: !!session && isOpen,
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: number) => cartApi.removeItem(itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cart"] });
      toast.success("Removed from bag");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: number; quantity: number }) =>
      cartApi.updateItem(itemId, quantity),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cart"] });
      if (vars.quantity === 0) toast.success("Item removed");
    },
  });

  const saveForLaterMutation = useMutation({
    mutationFn: ({ itemId, variantId }: { itemId: number; variantId: number }) =>
      experienceApi.saveForLater(variantId).then(() => cartApi.removeItem(itemId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cart"] });
      qc.invalidateQueries({ queryKey: ["saved-for-later"] });
      toast.success("Saved for later");
    },
    onError: () => toast.error("Failed to save for later"),
  });

  const { data: savedItems = [] } = useQuery({
    queryKey: ["saved-for-later"],
    queryFn: experienceApi.getSavedForLater,
    enabled: !!session && isOpen,
    staleTime: 60_000,
  });

  const moveToCartMutation = useMutation({
    mutationFn: (variantId: number) => experienceApi.moveToCart(variantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cart"] });
      qc.invalidateQueries({ queryKey: ["saved-for-later"] });
      toast.success("Moved to bag");
    },
    onError: () => toast.error("Failed to move to bag"),
  });

  const removeSavedMutation = useMutation({
    mutationFn: (variantId: number) => experienceApi.removeSavedForLater(variantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved-for-later"] });
    },
  });

  const items = cart?.items ?? [];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeCart}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white z-50 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-violet-600" />
                <h2 className="text-lg font-semibold text-slate-900">
                  My Bag
                </h2>
                <span className="bg-violet-100 text-violet-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {itemCount()}
                </span>
              </div>
              <button
                onClick={closeCart}
                className="p-2 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5 text-slate-600" />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {!session ? (
                <div className="flex flex-col items-center justify-center h-full text-center gap-4">
                  <ShoppingBag className="h-16 w-16 text-slate-200" />
                  <p className="text-slate-500">Login to view your bag</p>
                  <Link
                    href="/login"
                    onClick={closeCart}
                    className="px-4 py-1.5 text-sm font-medium border-2 border-violet-600 text-violet-600 hover:bg-violet-50 rounded-full transition-colors"
                  >
                    Login
                  </Link>
                </div>
              ) : isLoading ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="flex gap-3 animate-pulse">
                      <div className="w-20 h-24 bg-slate-100 rounded-xl" />
                      <div className="flex-1 space-y-2 py-1">
                        <div className="h-3 bg-slate-100 rounded w-3/4" />
                        <div className="h-3 bg-slate-100 rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center gap-4 pt-20">
                  <ShoppingBag className="h-20 w-20 text-slate-100" />
                  <p className="font-medium text-slate-700">Your bag is empty</p>
                  <p className="text-sm text-slate-400">Add items to get started</p>
                  <Link
                    href="/products"
                    onClick={closeCart}
                    className="px-4 py-1.5 text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 rounded-full transition-colors"
                  >
                    Shop Now
                  </Link>
                </div>
              ) : (
                <AnimatePresence>
                  {items.map((item) => {
                    const price = calcDiscountedPrice(
                      item.variant.product.basePrice,
                      item.variant.product.discountPct
                    );
                    return (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="flex gap-4 p-3 rounded-2xl hover:bg-slate-50 transition-colors"
                      >
                        {/* Image */}
                        <Link
                          href={`/products/${item.variant.product.id}`}
                          onClick={closeCart}
                          className="relative w-20 h-24 flex-shrink-0 rounded-xl overflow-hidden bg-slate-100"
                        >
                          <Image
                            src={getProductImage(item.variant.product.images)}
                            alt={item.variant.product.name}
                            fill
                            className="object-cover"
                          />
                        </Link>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/products/${item.variant.product.id}`}
                            onClick={closeCart}
                          >
                            <p className="text-sm font-medium text-slate-900 line-clamp-2 hover:text-violet-600 transition-colors">
                              {item.variant.product.name}
                            </p>
                          </Link>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {item.variant.size} · {item.variant.color}
                          </p>
                          <p className="text-sm font-bold text-slate-900 mt-1">
                            {formatPrice(price)}
                          </p>

                          {/* Quantity + Remove */}
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-1 bg-slate-100 rounded-full p-1">
                              <button
                                onClick={() =>
                                  updateMutation.mutate({
                                    itemId: item.id,
                                    quantity: item.quantity - 1,
                                  })
                                }
                                disabled={updateMutation.isPending}
                                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white transition-colors"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="w-6 text-center text-sm font-medium">
                                {item.quantity}
                              </span>
                              <button
                                onClick={() =>
                                  updateMutation.mutate({
                                    itemId: item.id,
                                    quantity: item.quantity + 1,
                                  })
                                }
                                disabled={updateMutation.isPending}
                                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white transition-colors"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() =>
                                  saveForLaterMutation.mutate({
                                    itemId: item.id,
                                    variantId: item.variantId,
                                  })
                                }
                                disabled={saveForLaterMutation.isPending}
                                title="Save for later"
                                className="p-1.5 rounded-full text-slate-400 hover:text-violet-500 hover:bg-violet-50 transition-colors"
                              >
                                <Bookmark className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => removeMutation.mutate(item.id)}
                                className="p-1.5 rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>

            {/* Saved for Later */}
            {session && savedItems.length > 0 && (
              <div className="pt-4 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Bookmark className="h-3.5 w-3.5" /> Saved for Later ({savedItems.length})
                </p>
                <div className="space-y-3">
                  {savedItems.map((s) => {
                    const product = s.variant?.product;
                    if (!product) return null;
                    const price = calcDiscountedPrice(product.basePrice, product.discountPct);
                    return (
                      <div key={s.id} className="flex gap-3 p-2 rounded-xl bg-slate-50">
                        <div className="relative w-14 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-white">
                          <Image src={getProductImage(product.images)} alt={product.name} fill className="object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-800 line-clamp-1">{product.name}</p>
                          <p className="text-xs text-slate-400">{s.variant?.size} · {s.variant?.color}</p>
                          <p className="text-xs font-bold text-slate-900 mt-0.5">{formatPrice(price)}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <button
                              onClick={() => moveToCartMutation.mutate(s.variantId)}
                              disabled={moveToCartMutation.isPending}
                              className="flex items-center gap-1 text-[10px] font-semibold text-violet-600 hover:text-violet-700 disabled:opacity-50"
                            >
                              <ShoppingCart className="h-3 w-3" /> Move to Bag
                            </button>
                            <button
                              onClick={() => removeSavedMutation.mutate(s.variantId)}
                              className="text-[10px] text-slate-400 hover:text-rose-500"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer */}
            {items.length > 0 && session && (
              <div className="p-5 border-t border-slate-100 space-y-4 bg-white">
                <div className="flex justify-between text-sm text-slate-500">
                  <span>Subtotal ({itemCount()} items)</span>
                  <span className="font-semibold text-slate-900">{formatPrice(totalPrice())}</span>
                </div>
                <p className="text-xs text-center text-slate-400">
                  Shipping & taxes calculated at checkout
                </p>
                <Link
                  href="/checkout"
                  onClick={closeCart}
                  className="w-full flex items-center justify-center px-8 py-3.5 text-base font-medium bg-violet-600 text-white hover:bg-violet-700 rounded-full transition-all hover:shadow-md hover:shadow-violet-200 active:scale-95"
                >
                  Proceed to Checkout
                </Link>
                <button
                  onClick={closeCart}
                  className="w-full text-sm text-slate-500 hover:text-violet-600 transition-colors"
                >
                  Continue Shopping
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
