// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import Link from "next/link";
import { ShoppingBag, Camera, MessageCircle, Users, PlayCircle, Mail } from "lucide-react";

export default function Footer() {
  const links = {
    Shop: [
      { label: "New Arrivals", href: "/products?sort=createdAt&order=desc" },
      { label: "Women", href: "/products?category=women" },
      { label: "Men", href: "/products?category=men" },
      { label: "Kids", href: "/products?category=kids" },
      { label: "Sale", href: "/products?sort=discountPct&order=desc" },
    ],
    Support: [
      { label: "FAQ", href: "#" },
      { label: "Shipping Policy", href: "#" },
      { label: "Returns & Exchanges", href: "#" },
      { label: "Size Guide", href: "#" },
      { label: "Track Order", href: "/orders" },
    ],
    Company: [
      { label: "About Us", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Press", href: "#" },
      { label: "Privacy Policy", href: "#" },
      { label: "Terms of Service", href: "#" },
    ],
  };

  return (
    <footer className="bg-slate-900 text-slate-300">
      {/* Newsletter */}
      <div className="border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-white font-semibold text-lg">Stay in the loop</h3>
              <p className="text-slate-400 text-sm mt-1">
                Get exclusive deals, style tips & new arrivals in your inbox.
              </p>
            </div>
            <form className="flex gap-2 w-full md:w-auto">
              <div className="flex items-center gap-2 bg-slate-800 rounded-full px-4 py-2 flex-1 md:w-72">
                <Mail className="h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="bg-transparent text-sm outline-none text-slate-300 placeholder-slate-500 flex-1"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-full transition-colors"
              >
                Subscribe
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Main footer */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <ShoppingBag className="h-4 w-4 text-white" />
              </div>
              <span className="text-white font-bold text-lg">ShopVerse</span>
            </Link>
            <p className="text-slate-400 text-sm leading-relaxed mb-4">
              Your one-stop destination for premium fashion, lifestyle, and accessories. Shop smart, live stylish.
            </p>
            <div className="flex gap-3">
              {[Camera, MessageCircle, Users, PlayCircle].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-800 hover:bg-violet-600 text-slate-400 hover:text-white transition-all duration-200"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          {Object.entries(links).map(([category, items]) => (
            <div key={category}>
              <h4 className="text-white font-semibold text-sm mb-4">{category}</h4>
              <ul className="space-y-2.5">
                {items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="text-slate-400 hover:text-violet-400 text-sm transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom */}
      <div className="border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-slate-500 text-xs">
            © {new Date().getFullYear()} ShopVerse. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <span className="text-slate-500 text-xs">🔒 Secure Checkout</span>
            <span className="text-slate-500 text-xs">🚚 Free Shipping</span>
            <span className="text-slate-500 text-xs">↩️ Easy Returns</span>
            {/*
              "Powered by ShopVerse" attribution — the adoption / k-factor loop.
              Required on the free tier (BSL); removable only via a commercial
              white-label license, which sets NEXT_PUBLIC_HIDE_POWERED_BY=true.
            */}
            {process.env.NEXT_PUBLIC_HIDE_POWERED_BY !== "true" && (
              <a
                href="https://github.com/vivironycrazy/shopverse"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-violet-400 text-xs font-medium transition-colors"
                aria-label="Powered by ShopVerse"
              >
                ⚡ Powered by ShopVerse
              </a>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
