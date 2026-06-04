// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * Reads the deployment's license entitlements from the OPTIONAL enterprise
 * module (`@shopverse/enterprise`, a separate private package). The open
 * project never depends on it — this talks to it over HTTP and degrades to
 * "community mode" (badge ON) whenever it isn't mounted or the call fails.
 *
 * This is the sanctioned, auditable replacement for the old honour-system
 * `NEXT_PUBLIC_HIDE_POWERED_BY` env flag: the badge can only be hidden by a
 * cryptographically valid WHITE_LABEL license.
 */

import { SERVER_API_BASE } from "@/lib/server-api";

// Called from server components (Footer) → server-reachable backend URL.
const API_BASE = SERVER_API_BASE;

export interface Branding {
  brandName?: string;
  logoUrl?: string;
  primaryColor?: string;
  footerText?: string;
  supportUrl?: string;
}

export interface Entitlements {
  status: "active" | "unlicensed" | "invalid";
  licensed: boolean;
  canHideBadge: boolean;
  branding: Branding | null;
  plan: string | null;
}

/**
 * Fetch entitlements (cached 5 min — they change rarely). Returns null when the
 * enterprise module isn't present or the request fails; callers MUST treat
 * null / !canHideBadge as community mode.
 */
export async function getEntitlements(): Promise<Entitlements | null> {
  try {
    const res = await fetch(`${API_BASE}/enterprise/entitlements`, {
      next: { revalidate: 300 },
      // This call now runs in the root layout, gating every page's render.
      // Cap it so an unreachable / slow backend can't block the whole app.
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    return (await res.json()) as Entitlements;
  } catch {
    return null;
  }
}

/** True only when a valid license grants white-label badge removal. */
export async function canHideBadge(): Promise<boolean> {
  const entitlements = await getEntitlements();
  return entitlements?.canHideBadge === true;
}
