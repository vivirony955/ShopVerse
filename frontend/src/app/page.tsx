// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, TrendingUp, Truck, RotateCcw, Shield } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { productsApi } from "@/lib/api";
import ProductCard from "@/components/product/ProductCard";
import { ProductCardSkeleton } from "@/components/ui/Skeleton";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

// NOTE: This file (app/page.tsx) takes routing priority over app/(shop)/page.tsx
// for the "/" path in Next.js App Router. Navbar + Footer are included directly
// since the (shop)/layout.tsx does not wrap this root-level page.

const HERO_CATEGORIES = [
  {
    name: "Women",
    slug: "women",
    image: "https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?w=600&q=80",
    color: "from-rose-400 to-pink-600",
  },
  {
    name: "Men",
    slug: "men",
    image: "https://images.unsplash.com/photo-1490578474895-699cd4e2cf59?w=600&q=80",
    color: "from-slate-600 to-slate-900",
  },
  {
    name: "Kids",
    slug: "kids",
    image: "https://images.unsplash.com/photo-1503919545889-aef636e10ad4?w=600&q=80",
    color: "from-amber-400 to-orange-500",
  },
  {
    name: "Accessories",
    slug: "accessories",
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80",
    color: "from-violet-500 to-purple-700",
  },
];

const FEATURES = [
  { icon: Truck,    title: "Free Shipping",      desc: "On orders above ₹499" },
  { icon: RotateCcw,title: "Easy Returns",       desc: "30-day hassle-free returns" },
  { icon: Shield,   title: "Secure Payment",     desc: "100% secure transactions" },
  { icon: Sparkles, title: "Authentic Products", desc: "Genuine brand guarantee" },
];

export default function HomePage() {
  const { data: newArrivals, isLoading: loadingNew } = useQuery({
    queryKey: ["products", "new"],
    queryFn: () => productsApi.getAll({ sort: "createdAt", order: "desc", limit: 8 }),
  });

  const { data: saleProducts, isLoading: loadingSale } = useQuery({
    queryKey: ["products", "sale"],
    queryFn: () => productsApi.getAll({ sort: "discountPct", order: "desc", limit: 4 }),
  });

  return (
    <>
      <Navbar />
      <main className="pt-16 overflow-x-hidden">

        {/* ─── Hero ──────────────────────────────────────────────────────────── */}
        <section className="relative min-h-[85vh] flex items-center bg-gradient-to-br from-violet-50 via-white to-purple-50 overflow-hidden">
          <div className="absolute top-20 right-10 w-72 h-72 bg-violet-200 rounded-full blur-3xl opacity-40" />
          <div className="absolute bottom-10 left-10 w-96 h-96 bg-purple-100 rounded-full blur-3xl opacity-50" />

          <div className="max-w-7xl mx-auto px-4 py-20 grid lg:grid-cols-2 gap-12 items-center relative z-10">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            >
              <div className="inline-flex items-center gap-2 bg-violet-100 text-violet-700 text-sm font-medium px-4 py-2 rounded-full mb-6">
                <Sparkles className="h-4 w-4" />
                New Collection 2025
              </div>
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-slate-900 leading-tight mb-6">
                Discover Your
                <span className="block bg-gradient-to-r from-violet-600 to-purple-500 bg-clip-text text-transparent">
                  Signature Style
                </span>
              </h1>
              <p className="text-lg text-slate-500 leading-relaxed mb-8 max-w-md">
                Explore thousands of premium products from top brands. Fashion that speaks your language, at prices you love.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/products"
                  className="inline-flex items-center gap-2 px-8 py-4 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-full transition-all duration-200 hover:shadow-xl hover:shadow-violet-200 active:scale-95"
                >
                  Shop Now <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/products?sort=discountPct&order=desc"
                  className="inline-flex items-center gap-2 px-8 py-4 border-2 border-slate-200 hover:border-violet-300 text-slate-700 font-semibold rounded-full transition-all duration-200 hover:bg-violet-50"
                >
                  <TrendingUp className="h-4 w-4 text-rose-500" />
                  View Sale
                </Link>
              </div>

              <div className="flex gap-8 mt-10 pt-8 border-t border-slate-100">
                {[
                  { value: "50K+", label: "Products" },
                  { value: "200+", label: "Brands" },
                  { value: "2M+",  label: "Happy Customers" },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                    <p className="text-sm text-slate-500">{s.label}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
              className="hidden lg:grid grid-cols-2 gap-4"
            >
              {HERO_CATEGORIES.map((cat, i) => (
                <Link
                  key={cat.slug}
                  href={`/products?category=${cat.slug}`}
                  className={`relative overflow-hidden rounded-3xl group ${
                    i === 0 ? "row-span-2 aspect-[3/4]" : "aspect-square"
                  }`}
                >
                  <Image src={cat.image} alt={cat.name} fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className={`absolute inset-0 bg-gradient-to-t ${cat.color} opacity-40`} />
                  <div className="absolute bottom-4 left-4">
                    <span className="text-white font-bold text-lg drop-shadow">{cat.name}</span>
                  </div>
                </Link>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ─── Features strip ─────────────────────────────────────────────────── */}
        <section className="border-y border-slate-100 bg-white">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {FEATURES.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{title}</p>
                    <p className="text-xs text-slate-500">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Category Cards ──────────────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-4 py-16">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-violet-600 font-medium text-sm mb-1">Browse by category</p>
              <h2 className="text-3xl font-bold text-slate-900">Shop by Style</h2>
            </div>
            <Link href="/products" className="text-sm font-medium text-violet-600 hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {HERO_CATEGORIES.map((cat, i) => (
              <motion.div
                key={cat.slug}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
              >
                <Link
                  href={`/products?category=${cat.slug}`}
                  className="relative block aspect-square rounded-3xl overflow-hidden group"
                >
                  <Image src={cat.image} alt={cat.name} fill className="object-cover group-hover:scale-110 transition-transform duration-500" />
                  <div className={`absolute inset-0 bg-gradient-to-t ${cat.color} opacity-50 group-hover:opacity-60 transition-opacity`} />
                  <div className="absolute inset-0 flex items-end p-5">
                    <div>
                      <p className="text-white font-bold text-xl">{cat.name}</p>
                      <p className="text-white/80 text-sm">Explore →</p>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ─── New Arrivals ─────────────────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-4 py-8 pb-16">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-violet-600 font-medium text-sm mb-1">Fresh drops</p>
              <h2 className="text-3xl font-bold text-slate-900">New Arrivals</h2>
            </div>
            <Link href="/products?sort=createdAt&order=desc" className="text-sm font-medium text-violet-600 hover:underline flex items-center gap-1">
              See all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {loadingNew
              ? Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)
              : newArrivals?.items.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
          {!loadingNew && (!newArrivals || newArrivals.items.length === 0) && (
            <div className="text-center py-20 text-slate-400">
              <p className="text-5xl mb-4">🛍️</p>
              <p className="text-lg font-medium">No products yet</p>
              <p className="text-sm mt-1">Add products from the admin panel to see them here.</p>
            </div>
          )}
        </section>

        {/* ─── Sale Banner ──────────────────────────────────────────────────────── */}
        <section className="bg-gradient-to-r from-violet-600 to-purple-700 py-16 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="absolute rounded-full bg-white"
                style={{ width: 40 + (i * 7) % 60, height: 40 + (i * 7) % 60, top: `${(i * 17) % 100}%`, left: `${(i * 23) % 100}%` }}
              />
            ))}
          </div>
          <div className="max-w-7xl mx-auto px-4 text-center relative z-10">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <span className="inline-block bg-white/20 text-white text-sm font-semibold px-4 py-1.5 rounded-full mb-4">
                Limited Time Offer
              </span>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Up to 70% Off</h2>
              <p className="text-white/80 text-lg mb-8">Massive discounts on thousands of products. Don&apos;t miss out!</p>
              <Link
                href="/products?sort=discountPct&order=desc"
                className="inline-flex items-center gap-2 bg-white text-violet-700 font-bold px-8 py-4 rounded-full hover:shadow-xl transition-all duration-200 hover:scale-105"
              >
                Shop the Sale <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>
          </div>
        </section>

        {/* ─── Top Deals ────────────────────────────────────────────────────────── */}
        {saleProducts && saleProducts.items.length > 0 && (
          <section className="max-w-7xl mx-auto px-4 py-16">
            <div className="flex items-end justify-between mb-8">
              <div>
                <p className="text-rose-500 font-medium text-sm mb-1">Hot deals</p>
                <h2 className="text-3xl font-bold text-slate-900">Top Discounts</h2>
              </div>
              <Link href="/products?sort=discountPct&order=desc" className="text-sm font-medium text-violet-600 hover:underline flex items-center gap-1">
                View all deals <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {loadingSale
                ? Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)
                : saleProducts.items.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
            </div>
          </section>
        )}

      </main>
      <Footer />
    </>
  );
}
