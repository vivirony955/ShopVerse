// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

"use client";
import { useState, useEffect } from "react";
import { Cookie, X, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

const STORAGE_KEY = "cookie-consent";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) setVisible(true);
  }, []);

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accepted: true, date: new Date().toISOString() }));
    setVisible(false);
  };

  const decline = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accepted: false, date: new Date().toISOString() }));
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-50 bg-white rounded-2xl border border-slate-200 shadow-2xl shadow-slate-200 p-5"
        >
          <button
            onClick={decline}
            className="absolute top-3 right-3 p-1 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="h-4 w-4 text-slate-400" />
          </button>

          <div className="flex items-start gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
              <Cookie className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 mb-1">We use cookies</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                We use cookies to improve your experience and personalize content. See our{" "}
                <Link href="/privacy" className="text-violet-600 hover:underline">
                  Privacy Policy
                </Link>{" "}
                for more.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={accept}
              className="flex-1 flex items-center justify-center gap-1.5 bg-violet-600 text-white text-sm font-semibold py-2 rounded-full hover:bg-violet-700 transition-colors"
            >
              <Check className="h-3.5 w-3.5" /> Accept All
            </button>
            <button
              onClick={decline}
              className="flex-1 text-sm font-medium text-slate-600 py-2 rounded-full border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Decline
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
