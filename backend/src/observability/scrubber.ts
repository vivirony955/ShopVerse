// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * Shared PII scrubber for Sentry events, OTel span attributes, and
 * anywhere else we surface request data outside the process.
 *
 * Design:
 *   - Field-name redaction (case-insensitive substring match) for keys
 *     that always contain PII (email, phone, address fields, financial
 *     amounts, secrets).
 *   - Value-pattern redaction for free-text that may embed PII even when
 *     the field name is innocent (e.g. error message containing a user
 *     email).
 *   - Recursive, immutable (returns a new object; never mutates input).
 *   - Cycle-safe via a WeakSet guard.
 *
 * The list of redacted keys is intentionally a superset of what the
 * existing AdminAuditInterceptor scrubs (password/token/secret/cardNumber/
 * cvv/authorization) plus the PII fields discovered in the Prisma schema
 * (email, phone, fullName, line1, line2, city, state, pincode,
 * guestEmail, addressSnapshot, amount).
 */

const PII_KEY_RX =
  /^(email|phone|firstName|lastName|fullName|name|line1|line2|address|addressSnapshot|city|state|pincode|guestEmail|amount|password|token|secret|cardNumber|cvv|authorization|cookie|set-cookie|refreshToken|accessToken|otp|jwt)$/i;

const EMAIL_RX = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;
// Best-effort phone pattern for the free-text fallback (the `phone` FIELD is
// already redacted by PII_KEY_RX). Matches international (+CC …) and
// separator-formatted national numbers, but deliberately NOT bare digit runs —
// globally those are ambiguous IDs (order/tracking/GSTIN) and would
// false-positive. Runs AFTER CARD_RX so card numbers redact first.
const PHONE_RX =
  /\+\d[\d\s().-]{6,14}\d|\b\d{2,5}[\s.-]\d{3,5}(?:[\s.-]\d{2,5})?\b/g;
// Defence in depth: card numbers should never reach the backend (Stripe-hosted)
// but if they ever do (e.g. via a misconfigured form), redact in transit.
// Pattern: 13–19 digits with optional space/dash separators, anchored on a
// trailing digit (not a separator) so we don't swallow whitespace after the
// match (e.g. "saw 4111 1111 1111 1111 in logs" → "saw [card] in logs").
const CARD_RX = /\b\d(?:[ -]?\d){12,18}\b/g;

const REDACTED = '[redacted]';

export function scrubString(s: string): string {
  return s
    .replace(EMAIL_RX, '[email]')
    .replace(CARD_RX, '[card]')
    .replace(PHONE_RX, '[phone]');
}

export function scrub<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (value == null) return value;
  if (typeof value === 'string') {
    return scrubString(value) as unknown as T;
  }
  if (typeof value !== 'object') return value;
  if (seen.has(value as object)) return value; // cycle guard
  seen.add(value as object);

  if (Array.isArray(value)) {
    // `Array.isArray` doesn't narrow T to an array element type, so map()
    // returns `any[]`. Explicit unknown[] cast before the T re-cast keeps
    // no-unsafe-return happy.
    const arr = value as unknown[];
    return arr.map((v) => scrub(v, seen)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (PII_KEY_RX.test(k)) {
      out[k] = REDACTED;
    } else {
      out[k] = scrub(v, seen);
    }
  }
  return out as unknown as T;
}
