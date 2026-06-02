// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { authApi } from "@/lib/api";
import { apiErrorMessage } from "@/lib/utils";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      await authApi.register(form);
      const res = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });
      if (res?.ok) {
        toast.success("Account created! Welcome to ShopVerse 🎉");
        router.push("/");
        router.refresh();
      }
    } catch (err: unknown) {
      // apiErrorMessage already joins NestJS-validation-pipe arrays;
      // upstream behaviour was to surface only the first message, which
      // matched what users actually saw (one line of feedback). Keep
      // that by splitting on the helper's comma-joined output.
      toast.error(apiErrorMessage(err, "Registration failed").split(",")[0]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-md"
    >
      <div className="bg-white rounded-3xl shadow-xl shadow-violet-100/50 border border-slate-100 p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-violet-100 text-violet-700 text-sm font-medium px-4 py-2 rounded-full mb-4">
            <Sparkles className="h-4 w-4" />
            Join ShopVerse
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
          <p className="text-slate-500 text-sm mt-1">Start shopping with the best deals</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="reg-firstName" className="block text-sm font-medium text-slate-700 mb-1.5">First Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="reg-firstName"
                  type="text"
                  value={form.firstName}
                  onChange={update("firstName")}
                  placeholder="John"
                  className="w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
                />
              </div>
            </div>
            <div>
              <label htmlFor="reg-lastName" className="block text-sm font-medium text-slate-700 mb-1.5">Last Name</label>
              <input
                id="reg-lastName"
                type="text"
                value={form.lastName}
                onChange={update("lastName")}
                placeholder="Doe"
                className="w-full px-3 py-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
              />
            </div>
          </div>

          <div>
            <label htmlFor="reg-email" className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="reg-email"
                type="email"
                value={form.email}
                onChange={update("email")}
                required
                placeholder="you@example.com"
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
              />
            </div>
          </div>

          <div>
            <label htmlFor="reg-password" className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="reg-password"
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={update("password")}
                required
                placeholder="Min 8 characters"
                className="w-full pl-10 pr-10 py-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-400">
            By creating an account, you agree to our{" "}
            <span className="text-violet-600 cursor-pointer">Terms of Service</span> and{" "}
            <span className="text-violet-600 cursor-pointer">Privacy Policy</span>.
          </p>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-violet-200 active:scale-[0.98]"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>Create Account <ArrowRight className="h-4 w-4" /></>
            )}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-violet-600 font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </motion.div>
  );
}
