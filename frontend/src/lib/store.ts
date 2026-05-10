// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem, WishlistItem, Product } from "@/types";

// ─── Cart Store (optimistic local state, synced from server) ──────────────────
interface CartStore {
  items: CartItem[];
  isOpen: boolean;
  setItems: (items: CartItem[]) => void;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  itemCount: () => number;
  totalPrice: () => number;
}

export const useCartStore = create<CartStore>()((set, get) => ({
  items: [],
  isOpen: false,
  setItems: (items) => set({ items }),
  openCart: () => set({ isOpen: true }),
  closeCart: () => set({ isOpen: false }),
  toggleCart: () => set((s) => ({ isOpen: !s.isOpen })),
  itemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
  totalPrice: () =>
    get().items.reduce((sum, i) => {
      const price =
        i.variant.product.basePrice *
        (1 - i.variant.product.discountPct / 100);
      return sum + price * i.quantity;
    }, 0),
}));

// ─── Wishlist Store (persisted to localStorage) ───────────────────────────────
interface WishlistStore {
  productIds: Set<number>;
  setFromServer: (items: WishlistItem[]) => void;
  addId: (id: number) => void;
  removeId: (id: number) => void;
  has: (id: number) => boolean;
}

export const useWishlistStore = create<WishlistStore>()(
  persist(
    (set, get) => ({
      productIds: new Set<number>(),
      setFromServer: (items) =>
        set({ productIds: new Set(items.map((i) => i.productId)) }),
      addId: (id) =>
        set((s) => ({ productIds: new Set([...s.productIds, id]) })),
      removeId: (id) =>
        set((s) => {
          const next = new Set(s.productIds);
          next.delete(id);
          return { productIds: next };
        }),
      has: (id) => get().productIds.has(id),
    }),
    {
      name: "wishlist",
      // Serialize/deserialize Set for localStorage
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const parsed = JSON.parse(str);
          return {
            ...parsed,
            state: {
              ...parsed.state,
              productIds: new Set(parsed.state.productIds ?? []),
            },
          };
        },
        setItem: (name, value) => {
          const serialized = {
            ...value,
            state: {
              ...value.state,
              productIds: [...value.state.productIds],
            },
          };
          localStorage.setItem(name, JSON.stringify(serialized));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);

// ─── UI Store (search panel, mobile menu) ─────────────────────────────────────
interface UIStore {
  searchOpen: boolean;
  mobileMenuOpen: boolean;
  toggleSearch: () => void;
  closeSearch: () => void;
  toggleMobileMenu: () => void;
  closeMobileMenu: () => void;
}

export const useUIStore = create<UIStore>()((set) => ({
  searchOpen: false,
  mobileMenuOpen: false,
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),
  closeSearch: () => set({ searchOpen: false }),
  toggleMobileMenu: () => set((s) => ({ mobileMenuOpen: !s.mobileMenuOpen })),
  closeMobileMenu: () => set({ mobileMenuOpen: false }),
}));

// ─── Compare Store (up to 4 products) ────────────────────────────────────────
const COMPARE_LIMIT = 4;

interface CompareStore {
  products: Product[];
  add: (product: Product) => void;
  remove: (id: number) => void;
  has: (id: number) => boolean;
  clear: () => void;
}

export const useCompareStore = create<CompareStore>()(
  persist(
    (set, get) => ({
      products: [],
      add: (product) => {
        if (get().products.length >= COMPARE_LIMIT) return;
        if (get().has(product.id)) return;
        set((s) => ({ products: [...s.products, product] }));
      },
      remove: (id) =>
        set((s) => ({ products: s.products.filter((p) => p.id !== id) })),
      has: (id) => get().products.some((p) => p.id === id),
      clear: () => set({ products: [] }),
    }),
    { name: "compare" }
  )
);

// ─── Recently Viewed Store (persisted, max 20) ────────────────────────────────
const RECENTLY_VIEWED_LIMIT = 20;

interface RecentlyViewedStore {
  products: Product[];
  push: (product: Product) => void;
  clear: () => void;
}

export const useRecentlyViewedStore = create<RecentlyViewedStore>()(
  persist(
    (set, get) => ({
      products: [],
      push: (product) => {
        const filtered = get().products.filter((p) => p.id !== product.id);
        set({ products: [product, ...filtered].slice(0, RECENTLY_VIEWED_LIMIT) });
      },
      clear: () => set({ products: [] }),
    }),
    { name: "recently-viewed" }
  )
);
