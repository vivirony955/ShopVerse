// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { UserCheck, Search, Shield, AlertTriangle } from "lucide-react";
import { adminApi } from "@/lib/api";
import { apiErrorMessage } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";

interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  createdAt: string;
}

export default function AdminImpersonatePage() {
  const { data: session } = useSession();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState<number | null>(null);
  const [result, setResult] = useState<{ token: string; accessToken?: string; userId: number } | null>(null);
  const [error, setError] = useState("");

  // Role check
  const role = (() => {
    if (session?.role) return session.role;
    if (session?.user?.role) return session.user.role;
    const token = session?.accessToken;
    if (!token) return undefined;
    try {
      const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return (JSON.parse(atob(b64)) as { role?: string }).role;
    } catch { return undefined; }
  })();

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["admin", "impersonate-users", search],
    queryFn: () => adminApi.getImpersonatableUsers(search || undefined),
    enabled: search.length >= 2 || search.length === 0,
  });

  const handleImpersonate = async (userId: number) => {
    if (!confirm("Issue an impersonation token for this user? This action is logged.")) return;
    setLoading(userId);
    setError("");
    setResult(null);
    try {
      const data = await adminApi.impersonateUser(userId);
      setResult({ token: data.accessToken, userId: data.userId });
    } catch (e: unknown) {
      setError(apiErrorMessage(e, "Failed to impersonate user"));
    } finally {
      setLoading(null);
    }
  };

  if (role && role !== "SUPER_ADMIN" && role !== "ADMIN") {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20 text-center">
        <Shield className="h-12 w-12 mx-auto mb-3 text-red-400 opacity-60" />
        <p className="font-medium text-slate-700">Access Denied</p>
        <p className="text-sm text-slate-400 mt-1">Impersonation requires SUPER_ADMIN role</p>
      </div>
    );
  }

  const ROLE_COLORS: Record<string, string> = {
    ADMIN: "bg-violet-100 text-violet-700",
    SUPER_ADMIN: "bg-red-100 text-red-700",
    FINANCE: "bg-green-100 text-green-700",
    CS_AGENT: "bg-blue-100 text-blue-700",
    OPS_MANAGER: "bg-amber-100 text-amber-700",
    MERCH: "bg-pink-100 text-pink-700",
    USER: "bg-slate-100 text-slate-600",
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-2">
        <UserCheck className="h-7 w-7 text-red-600" />
        <h1 className="text-2xl font-bold text-slate-900">User Impersonation</h1>
        <span className="bg-red-100 text-red-700 text-xs font-semibold px-2.5 py-1 rounded-full">SUPER_ADMIN</span>
      </div>
      <p className="text-sm text-slate-500 mb-8">All impersonation events are logged in the audit trail. Use this to debug customer-reported issues only.</p>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-8 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Use with caution</p>
          <p className="text-xs text-amber-700 mt-0.5">Impersonation tokens expire in 15 minutes. Every impersonation is logged and auditable. Never use for personal access.</p>
        </div>
      </div>

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 mb-6">
          <p className="text-sm font-semibold text-green-800 mb-2">Impersonation token issued for User #{result.userId}</p>
          <div className="bg-white rounded-lg border border-green-200 px-3 py-2 font-mono text-xs text-slate-700 break-all select-all">
            {result.token}
          </div>
          <p className="text-xs text-green-600 mt-2">Copy this token and use it as Bearer Authorization header. Expires in 15 minutes.</p>
          <button onClick={() => setResult(null)} className="mt-3 text-xs font-medium text-green-700 underline">Dismiss</button>
        </div>
      )}

      {error && <p className="text-red-600 text-sm mb-4 bg-red-50 rounded-lg px-4 py-3">{error}</p>}

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl text-sm"
          placeholder="Search by name or email (min 2 chars)…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No users found</p>
          {search.length > 0 && <p className="text-sm mt-1">Try a different search term</p>}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-6 py-3">User</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Role</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Joined</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-semibold text-slate-800 text-sm">{u.firstName} {u.lastName}</p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ROLE_COLORS[u.role] ?? "bg-slate-100 text-slate-600"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-500">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-4">
                    <button
                      onClick={() => handleImpersonate(u.id)}
                      disabled={loading === u.id}
                      className="flex items-center gap-1.5 text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                      <UserCheck className="h-3.5 w-3.5" />
                      {loading === u.id ? "Issuing…" : "Impersonate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
