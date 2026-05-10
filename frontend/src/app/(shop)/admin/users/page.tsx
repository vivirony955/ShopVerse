"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Users, Search, Shield, AlertTriangle } from "lucide-react";
import { adminApi } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";

interface AdminUser {
  id: number;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  loyaltyPoints: number;
  createdAt: string;
  _count?: { orders: number };
}

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-rose-100 text-rose-700",
  ADMIN: "bg-violet-100 text-violet-700",
  FINANCE: "bg-emerald-100 text-emerald-700",
  CS_AGENT: "bg-sky-100 text-sky-700",
  OPS: "bg-orange-100 text-orange-700",
  MERCH: "bg-pink-100 text-pink-700",
  USER: "bg-slate-100 text-slate-600",
};

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => adminApi.getUsers({ limit: 100 }),
  });

  const users: AdminUser[] = data ?? [];
  const filtered = users.filter((u) => {
    const matchSearch =
      !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      `${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "ALL" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Users className="h-7 w-7 text-violet-600" />
        <h1 className="text-2xl font-bold text-slate-900">Customer Management</h1>
        <span className="text-sm text-slate-500 font-normal">({users.length} total)</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["ALL", "USER", "ADMIN", "SUPER_ADMIN", "CS_AGENT", "FINANCE", "OPS", "MERCH"].map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                roleFilter === r
                  ? "bg-violet-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-violet-100 hover:text-violet-700"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {["User", "Email", "Role", "Orders", "Loyalty Points", "Joined"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 rounded w-24" />
                      </td>
                    ))}
                  </tr>
                ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400 text-sm">
                    No users found
                  </td>
                </tr>
              )}
              {filtered.map((user) => (
                <tr key={user.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                        {(user.firstName?.[0] ?? user.email[0]).toUpperCase()}
                      </div>
                      <p className="text-sm font-medium text-slate-800">
                        {[user.firstName, user.lastName].filter(Boolean).join(" ") || "—"}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{user.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {["ADMIN", "SUPER_ADMIN"].includes(user.role) && <Shield className="h-3.5 w-3.5 text-violet-600" />}
                      {["FINANCE", "CS_AGENT", "OPS", "MERCH"].includes(user.role) && <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />}
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[user.role] ?? "bg-slate-100 text-slate-600"}`}>
                        {user.role}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 font-medium">
                    {user._count?.orders ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-amber-600 font-medium">
                    {user.loyaltyPoints.toLocaleString()} pts
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
