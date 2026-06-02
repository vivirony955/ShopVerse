// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function calcDiscountedPrice(base: number, discountPct: number): number {
  return base * (1 - discountPct / 100);
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(dateStr));
}

export function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + "…" : str;
}

export const ORDER_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  PENDING:          { label: "Pending",          color: "bg-amber-100 text-amber-700" },
  CONFIRMED:        { label: "Confirmed",        color: "bg-blue-100 text-blue-700" },
  PROCESSING:       { label: "Processing",       color: "bg-indigo-100 text-indigo-700" },
  SHIPPED:          { label: "Shipped",          color: "bg-purple-100 text-purple-700" },
  DELIVERED:        { label: "Delivered",        color: "bg-green-100 text-green-700" },
  CANCELLED:        { label: "Cancelled",        color: "bg-red-100 text-red-700" },
  RETURN_REQUESTED: { label: "Return Requested", color: "bg-orange-100 text-orange-700" },
  RETURNED:         { label: "Returned",         color: "bg-slate-100 text-slate-700" },
  REFUNDED:         { label: "Refunded",         color: "bg-teal-100 text-teal-700" },
};

// Fallback product images when API returns empty
export const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80";

export function getProductImage(images: string[]): string {
  return images?.[0] || PLACEHOLDER_IMAGE;
}

// ─── API error helpers ──────────────────────────────────────────────────────
// Axios attaches its parsed response to err.response (and the body to
// err.response.data). React Query's onError callback widens that to
// `Error`, which doesn't model those fields, so previously the codebase
// caught with `(err: any)` everywhere. Here we describe the shape we
// actually care about and centralise the narrowing.

export interface ApiErrorShape {
  response?: {
    data?: {
      message?: string | string[];
      [k: string]: unknown;
    };
    status?: number;
  };
  message?: string;
}

/**
 * Extracts a human-readable error message from an unknown error value.
 * Tries `err.response.data.message` (axios + server JSON envelope),
 * then `err.message` (plain Error), then the fallback. Arrays from the
 * NestJS validation pipe are joined with commas.
 */
export function apiErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  const e = err as ApiErrorShape | null | undefined;
  const raw = e?.response?.data?.message ?? e?.message;
  if (Array.isArray(raw)) return raw.join(", ") || fallback;
  if (typeof raw === "string" && raw.length > 0) return raw;
  return fallback;
}
