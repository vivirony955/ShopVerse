"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Tag } from "lucide-react";
import Link from "next/link";

const STORAGE_KEY = "exit-intent-shown";
const COOLDOWN_HOURS = 24;

export default function ExitIntentPopup() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const lastShown = localStorage.getItem(STORAGE_KEY);
    if (lastShown) {
      const hoursAgo = (Date.now() - Number(lastShown)) / (1000 * 60 * 60);
      if (hoursAgo < COOLDOWN_HOURS) return;
    }

    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 10) {
        setVisible(true);
        localStorage.setItem(STORAGE_KEY, String(Date.now()));
        document.removeEventListener("mouseleave", handleMouseLeave);
      }
    };

    // Small delay before attaching to avoid immediate trigger
    const timer = setTimeout(() => {
      document.addEventListener("mouseleave", handleMouseLeave);
    }, 5_000);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setVisible(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
          >
            <button
              onClick={() => setVisible(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 transition-colors z-10"
            >
              <X className="h-4 w-4 text-slate-500" />
            </button>

            {/* Hero */}
            <div className="bg-gradient-to-br from-violet-600 to-purple-700 p-8 text-center text-white">
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Tag className="h-7 w-7 text-white" />
              </div>
              <h2 className="text-2xl font-extrabold mb-2">Wait! Don't go yet 🎁</h2>
              <p className="text-white/80 text-sm">
                You have items in your cart. Complete your order and save!
              </p>
            </div>

            <div className="p-6 text-center">
              <div className="bg-violet-50 border border-violet-200 rounded-2xl px-6 py-4 mb-5 inline-block">
                <p className="text-xs font-medium text-violet-600 mb-1">Your exclusive discount code</p>
                <p className="text-2xl font-extrabold text-violet-700 tracking-widest">STAYWITH10</p>
                <p className="text-xs text-violet-500 mt-1">10% off — valid for the next 30 minutes</p>
              </div>

              <div className="flex flex-col gap-3">
                <Link
                  href="/checkout"
                  onClick={() => setVisible(false)}
                  className="w-full bg-violet-600 text-white font-semibold py-3 rounded-full hover:bg-violet-700 transition-colors"
                >
                  Claim My Discount & Checkout
                </Link>
                <button
                  onClick={() => setVisible(false)}
                  className="w-full text-sm text-slate-400 hover:text-slate-600 transition-colors"
                >
                  No thanks, I'll pass on the savings
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
