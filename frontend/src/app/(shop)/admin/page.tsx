// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

"use client";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Package,
  ShoppingCart,
  Users,
  AlertTriangle,
  TrendingUp,
  Clock,
  CheckCircle,
  DollarSign,
  RotateCcw,
  Tag,
  Zap,
  Layers,
  Warehouse,
  UserCheck,
  Upload,
  Puzzle,
} from "lucide-react";
import { adminApi } from "@/lib/api";
import type { Order } from "@/types";
import { Skeleton } from "@/components/ui/Skeleton";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  PROCESSING: "bg-indigo-100 text-indigo-700",
  SHIPPED: "bg-cyan-100 text-cyan-700",
  DELIVERED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-600",
  RETURN_REQUESTED: "bg-orange-100 text-orange-700",
  RETURNED: "bg-slate-100 text-slate-600",
  REFUNDED: "bg-purple-100 text-purple-700",
};

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-2xl font-extrabold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function RecentOrderRow({ order }: { order: Order }) {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-slate-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">Order #{order.id}</p>
        <p className="text-xs text-slate-400 mt-0.5">
          {new Date(order.createdAt).toLocaleString()}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-slate-900">₹{order.total.toFixed(2)}</p>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            STATUS_COLORS[order.status] ?? "bg-slate-100 text-slate-600"
          }`}
        >
          {order.status}
        </span>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Role extraction: try session.role, session.user.role, then decode from accessToken JWT
  const role = (() => {
    if (session?.role) return session.role;
    if (session?.user?.role) return session.user.role;
    const token = session?.accessToken;
    if (!token) return undefined;
    try {
      // JWT uses base64url — convert to base64 before decoding
      const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(b64)) as { role?: string };
      return payload.role;
    } catch { return undefined; }
  })();

  useEffect(() => {
    if (status === "unauthenticated" || (status === "authenticated" && role !== "ADMIN")) {
      router.replace("/");
    }
  }, [status, role, router]);

  if (status === "loading" || (status === "authenticated" && role !== "ADMIN")) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10">
        <Skeleton className="h-8 w-48 mb-8 rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return <AdminDashboardContent />;
}

function AdminDashboardContent() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: adminApi.getStats,
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <BarChart3 className="h-7 w-7 text-violet-600" />
        <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
      </div>

      {/* Stats grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={ShoppingCart}
            label="Total Orders"
            value={stats?.totalOrders ?? 0}
            color="bg-violet-50 text-violet-600"
          />
          <StatCard
            icon={TrendingUp}
            label="Total Revenue"
            value={`₹${((stats?.totalRevenue ?? 0) / 1000).toFixed(1)}K`}
            color="bg-green-50 text-green-600"
          />
          <StatCard
            icon={Users}
            label="Total Users"
            value={stats?.totalUsers ?? 0}
            color="bg-blue-50 text-blue-600"
          />
          <StatCard
            icon={Package}
            label="Total Products"
            value={stats?.totalProducts ?? 0}
            color="bg-amber-50 text-amber-600"
          />
        </div>
      )}

      {/* Alerts */}
      {stats && stats.lowStockCount > 0 && (
        <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-5 py-4 mb-8">
          <AlertTriangle className="h-5 w-5 text-orange-500 flex-shrink-0" />
          <p className="text-sm text-orange-700 font-medium">
            {stats.lowStockCount} product variant{stats.lowStockCount !== 1 ? "s" : ""} running low on stock
          </p>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent orders */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Clock className="h-4.5 w-4.5 text-slate-400" />
            <h2 className="font-bold text-slate-800">Recent Orders</h2>
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-xl" />
              ))}
            </div>
          ) : stats?.recentOrders?.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">No orders yet</p>
          ) : (
            stats?.recentOrders?.map((order) => (
              <RecentOrderRow key={order.id} order={order} />
            ))
          )}
        </div>

        {/* Quick actions */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <CheckCircle className="h-4.5 w-4.5 text-slate-400" />
            <h2 className="font-bold text-slate-800">Quick Actions</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "View All Orders", href: "/admin/orders", icon: ShoppingCart, color: "bg-violet-50 text-violet-600" },
              { label: "Manage Products", href: "/admin/products", icon: Package, color: "bg-blue-50 text-blue-600" },
              { label: "View Users", href: "/admin/users", icon: Users, color: "bg-green-50 text-green-600" },
              { label: "Fraud Flags", href: "/admin/fraud", icon: AlertTriangle, color: "bg-red-50 text-red-600" },
              { label: "Finance", href: "/admin/finance", icon: DollarSign, color: "bg-emerald-50 text-emerald-600" },
              { label: "Analytics", href: "/admin/analytics", icon: BarChart3, color: "bg-indigo-50 text-indigo-600" },
              { label: "Refund Approvals", href: "/admin/refund-approvals", icon: RotateCcw, color: "bg-amber-50 text-amber-600" },
              { label: "Coupons", href: "/admin/coupons", icon: Tag, color: "bg-purple-50 text-purple-600" },
              { label: "Flash Sales", href: "/admin/flash-sales", icon: Zap, color: "bg-yellow-50 text-yellow-600" },
              { label: "Categories", href: "/admin/categories", icon: Layers, color: "bg-cyan-50 text-cyan-600" },
              { label: "Inventory", href: "/admin/inventory", icon: Package, color: "bg-orange-50 text-orange-600" },
              { label: "Warehouses", href: "/admin/warehouses", icon: Warehouse, color: "bg-teal-50 text-teal-600" },
              { label: "Impersonate", href: "/admin/impersonate", icon: UserCheck, color: "bg-rose-50 text-rose-600" },
              { label: "Bulk Upload", href: "/admin/products/bulk-upload", icon: Upload, color: "bg-blue-50 text-blue-600" },
              { label: "Plugins", href: "/admin/plugins", icon: Puzzle, color: "bg-violet-50 text-violet-600" },
            ].map(({ label, href, icon: Icon, color }) => (
              <a
                key={href}
                href={href}
                className="flex items-center gap-3 p-4 rounded-xl border border-slate-100 hover:border-violet-200 hover:shadow-sm transition-all group"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium text-slate-700 group-hover:text-violet-700 transition-colors">
                  {label}
                </span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
