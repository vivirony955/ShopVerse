// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingBag, Heart, Search, User, Menu, X,
  ChevronDown, LogOut, Package, MapPin, Wallet, GitCompareArrows, MessageCircle, Star, Users, Bell, Mic, Moon, Sun,
} from "lucide-react";
import { useCartStore, useWishlistStore, useUIStore } from "@/lib/store";
import { useQuery } from "@tanstack/react-query";
import { cartApi, wishlistApi, categoriesApi, productsApi, notificationsApi } from "@/lib/api";
import { useDebounce } from "@/lib/useDebounce";
import { useDarkMode } from "@/lib/useDarkMode";

export default function Navbar() {
  const { data: session } = useSession();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isListening, setIsListening] = useState(false);
  const { dark, toggle: toggleDark } = useDarkMode();
  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data: suggestions } = useQuery({
    queryKey: ["autocomplete", debouncedSearch],
    queryFn: () => productsApi.autocomplete(debouncedSearch),
    enabled: debouncedSearch.length >= 2,
    staleTime: 30_000,
  });
  const { data: notifData } = useQuery({
    queryKey: ["notif-count"],
    queryFn: () => notificationsApi.getUnreadCount(),
    enabled: !!session,
    refetchInterval: 60_000,
  });
  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationsApi.getAll(),
    enabled: notifOpen && !!session,
  });

  // F4-03: Voice search.
  // SpeechRecognition isn't in lib.dom yet so we describe the minimal
  // surface we touch instead of reaching for `any`.
  function startVoiceSearch() {
    interface SRResult { readonly transcript: string }
    interface SREvent { readonly results: ReadonlyArray<ReadonlyArray<SRResult>> }
    interface SRInstance {
      lang: string;
      onstart: () => void;
      onresult: (e: SREvent) => void;
      onend: () => void;
      start(): void;
    }
    interface WindowWithSR {
      SpeechRecognition?: new () => SRInstance;
      webkitSpeechRecognition?: new () => SRInstance;
    }
    const w = window as unknown as WindowWithSR;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = "en-IN";
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setSearchQuery(transcript);
      router.push(`/products?search=${encodeURIComponent(transcript)}`);
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  }

  const { toggleCart, itemCount, setItems } = useCartStore();
  const { setFromServer, productIds } = useWishlistStore();
  const { searchOpen, toggleSearch, closeSearch, mobileMenuOpen, toggleMobileMenu } = useUIStore();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  // Prefetch cart count
  useQuery({
    queryKey: ["cart"],
    queryFn: async () => {
      const cart = await cartApi.get();
      setItems(cart.items);
      return cart;
    },
    enabled: !!session,
  });

  // Prefetch wishlist ids
  useQuery({
    queryKey: ["wishlist"],
    queryFn: async () => {
      const items = await wishlistApi.get();
      setFromServer(items);
      return items;
    },
    enabled: !!session,
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: categoriesApi.getAll,
    staleTime: 5 * 60 * 1000,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
      closeSearch();
      setSearchQuery("");
    }
  };

  const navLinks = [
    { label: "New Arrivals", href: "/products?sort=createdAt&order=desc" },
    { label: "Women", href: "/products?category=women" },
    { label: "Men", href: "/products?category=men" },
    { label: "Kids", href: "/products?category=kids" },
    { label: "Flash Sales", href: "/flash-sales" },
    { label: "Sale", href: "/products?minPrice=0&sort=discountPct&order=desc" },
  ];

  return (
    <>
      <header
        className={`fixed top-0 inset-x-0 z-30 transition-all duration-300 ${
          scrolled
            ? "bg-white/95 backdrop-blur-md shadow-sm border-b border-slate-100"
            : "bg-white"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-1.5 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center">
                <ShoppingBag className="h-4 w-4 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
                ShopVerse
              </span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-6">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-sm font-medium text-slate-600 hover:text-violet-600 transition-colors relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-violet-600 after:transition-all hover:after:w-full"
                >
                  {l.label}
                </Link>
              ))}
              {categories && categories.length > 0 && (
                <div className="relative group">
                  <button className="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-violet-600 transition-colors">
                    All Categories <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                    <div className="p-2">
                      {categories.map((cat) => (
                        <Link
                          key={cat.id}
                          href={`/products?category=${cat.slug}`}
                          className="flex items-center px-3 py-2 text-sm text-slate-700 hover:text-violet-600 hover:bg-violet-50 rounded-xl transition-colors"
                        >
                          {cat.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-1">
              {/* Search */}
              <button
                onClick={toggleSearch}
                className="p-2.5 rounded-full hover:bg-slate-100 transition-colors text-slate-600 hover:text-violet-600"
              >
                <Search className="h-5 w-5" />
              </button>

              {/* Wishlist */}
              <Link
                href="/wishlist"
                className="relative p-2.5 rounded-full hover:bg-slate-100 transition-colors text-slate-600 hover:text-rose-500"
              >
                <Heart className="h-5 w-5" />
                {productIds.size > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {productIds.size}
                  </span>
                )}
              </Link>

              {/* F2-06: Notification Bell */}
              {session && (
                <div className="relative">
                  <button
                    onClick={() => setNotifOpen(!notifOpen)}
                    className="relative p-2.5 rounded-full hover:bg-slate-100 transition-colors text-slate-600 hover:text-violet-600"
                  >
                    <Bell className="h-5 w-5" />
                    {(notifData?.count ?? 0) > 0 && (
                      <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {notifData!.count > 9 ? "9+" : notifData!.count}
                      </span>
                    )}
                  </button>
                  {notifOpen && (
                    <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 max-h-96 overflow-y-auto">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                        <span className="font-semibold text-slate-800 text-sm">Notifications</span>
                        <button
                          onClick={() => { notificationsApi.markAllRead(); setNotifOpen(false); }}
                          className="text-xs text-violet-600 hover:underline"
                        >Mark all read</button>
                      </div>
                      {!notifications || notifications.length === 0 ? (
                        <p className="text-center text-slate-400 text-sm py-8">No notifications</p>
                      ) : (
                        notifications.map((n) => (
                          <div key={n.id} className={`px-4 py-3 border-b border-slate-50 hover:bg-slate-50 cursor-pointer ${!n.isRead ? "bg-violet-50/40" : ""}`}
                            onClick={() => { notificationsApi.markRead(n.id); if (n.link) router.push(n.link); setNotifOpen(false); }}>
                            <p className="text-sm font-medium text-slate-800">{n.title}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{n.body}</p>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Cart */}
              <button
                onClick={toggleCart}
                className="relative p-2.5 rounded-full hover:bg-slate-100 transition-colors text-slate-600 hover:text-violet-600"
              >
                <ShoppingBag className="h-5 w-5" />
                {itemCount() > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-violet-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {itemCount()}
                  </span>
                )}
              </button>

              {/* F2-21: Dark mode toggle */}
              <button
                onClick={toggleDark}
                title={dark ? "Switch to light mode" : "Switch to dark mode"}
                className="p-2.5 rounded-full hover:bg-slate-100 transition-colors text-slate-600 hover:text-violet-600"
              >
                {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>

              {/* User */}
              {session ? (
                <div className="relative">
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-2 ml-1 pl-1 pr-3 py-1.5 rounded-full hover:bg-slate-100 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
                      {(session.user?.name?.[0] || session.user?.email?.[0] || "U").toUpperCase()}
                    </div>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                  </button>

                  <AnimatePresence>
                    {userMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 4, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-xl border border-slate-100 z-50"
                      >
                        <div className="p-3 border-b border-slate-100">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {session.user?.name || "My Account"}
                          </p>
                          <p className="text-xs text-slate-400 truncate">{session.user?.email}</p>
                        </div>
                        <div className="p-2">
                          {[
                            { icon: User, label: "My Profile", href: "/profile" },
                            { icon: Package, label: "My Orders", href: "/orders" },
                            { icon: Heart, label: "Wishlist", href: "/wishlist" },
                            { icon: Wallet, label: "My Wallet", href: "/wallet" },
                            { icon: GitCompareArrows, label: "Compare", href: "/compare" },
                            { icon: MessageCircle, label: "Support", href: "/support" },
                            { icon: Star, label: "Loyalty Points", href: "/loyalty" },
                            { icon: Users, label: "Refer & Earn", href: "/referral" },
                            { icon: MapPin, label: "Addresses", href: "/profile#addresses" },
                          ].map(({ icon: Icon, label, href }) => (
                            <Link
                              key={href}
                              href={href}
                              onClick={() => setUserMenuOpen(false)}
                              className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 hover:text-violet-600 hover:bg-violet-50 rounded-xl transition-colors"
                            >
                              <Icon className="h-4 w-4" />
                              {label}
                            </Link>
                          ))}
                        </div>
                        <div className="p-2 border-t border-slate-100">
                          <button
                            onClick={() => signOut({ callbackUrl: "/" })}
                            className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                          >
                            <LogOut className="h-4 w-4" />
                            Sign Out
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="hidden sm:flex items-center gap-2 ml-1 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-full hover:bg-violet-700 transition-colors"
                >
                  <User className="h-4 w-4" />
                  Login
                </Link>
              )}

              {/* Mobile menu toggle */}
              <button
                onClick={toggleMobileMenu}
                className="lg:hidden p-2.5 rounded-full hover:bg-slate-100 transition-colors"
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5 text-slate-600" />
                ) : (
                  <Menu className="h-5 w-5 text-slate-600" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden border-t border-slate-100 bg-white overflow-hidden"
            >
              <nav className="p-4 space-y-1">
                {navLinks.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={toggleMobileMenu}
                    className="flex items-center py-3 px-4 text-sm font-medium text-slate-700 hover:text-violet-600 hover:bg-violet-50 rounded-xl transition-colors"
                  >
                    {l.label}
                  </Link>
                ))}
                {!session && (
                  <Link
                    href="/login"
                    onClick={toggleMobileMenu}
                    className="flex items-center justify-center py-3 mt-2 bg-violet-600 text-white text-sm font-semibold rounded-xl"
                  >
                    Login / Register
                  </Link>
                )}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Search Overlay */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={closeSearch}
          >
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white max-w-2xl mx-auto mt-20 mx-4 rounded-2xl shadow-2xl overflow-hidden"
            >
              <form onSubmit={handleSearch} className="flex items-center gap-3 p-4">
                <Search className="h-5 w-5 text-violet-400 flex-shrink-0" />
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for products, brands, categories..."
                  className="flex-1 text-base outline-none bg-transparent text-slate-900 placeholder-slate-400"
                />
                {/* F4-03: Voice search */}
                <button
                  type="button"
                  onClick={startVoiceSearch}
                  title="Voice search"
                  className={`p-1 rounded-full transition-colors ${isListening ? "text-red-500 animate-pulse" : "text-slate-400 hover:text-violet-600"}`}
                >
                  <Mic className="h-4 w-4" />
                </button>
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery("")}>
                    <X className="h-4 w-4 text-slate-400 hover:text-slate-700" />
                  </button>
                )}
                <button
                  type="submit"
                  className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-full hover:bg-violet-700 transition-colors"
                >
                  Search
                </button>
              </form>
              <div className="px-4 pb-4">
                {/* Autocomplete suggestions */}
                {suggestions && suggestions.length > 0 && searchQuery.length >= 2 ? (
                  <div>
                    <p className="text-xs text-slate-400 mb-2">Suggestions</p>
                    <div className="space-y-1">
                      {suggestions.map((s: { id: number; name: string; images?: string[]; basePrice?: number; discountPct?: number; category?: { name: string } }) => {
                        const salePrice = s.basePrice && s.discountPct ? Math.round(s.basePrice * (1 - s.discountPct / 100)) : s.basePrice;
                        const imgSrc = s.images?.[0] || "/placeholder.png";
                        return (
                          <button
                            key={s.id}
                            onClick={() => {
                              router.push(`/products/${s.id}`);
                              closeSearch();
                              setSearchQuery("");
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-violet-50 hover:text-violet-700 rounded-xl transition-colors flex items-center gap-3"
                          >
                            <div className="relative w-10 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-slate-100">
                              <Image src={imgSrc} alt={s.name} fill className="object-cover" sizes="40px" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{s.name}</p>
                              <div className="flex items-center gap-2">
                                {salePrice != null && (
                                  <span className="text-xs font-semibold text-slate-900">
                                    {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0 }).format(salePrice)}
                                  </span>
                                )}
                                {s.discountPct ? (
                                  <span className="text-xs text-rose-500 font-medium">-{s.discountPct}%</span>
                                ) : null}
                                {s.category && (
                                  <span className="text-xs text-slate-400">in {s.category.name}</span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-slate-400 mb-2">Popular searches</p>
                    <div className="flex flex-wrap gap-2">
                      {["Tops", "Jeans", "Sneakers", "Dresses", "Watches"].map((s) => (
                        <button
                          key={s}
                          onClick={() => {
                            setSearchQuery(s);
                            router.push(`/products?search=${s}`);
                            closeSearch();
                          }}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-violet-100 hover:text-violet-700 text-slate-600 text-sm rounded-full transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
