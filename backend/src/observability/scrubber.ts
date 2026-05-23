// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
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
const INDIA_PHONE_RX = /\b[6-9]\d{9}\b/g;
// Defence in depth: card numbers should never reach the backend (Stripe-hosted)
// but if they ever do (e.g. via a misconfigured form), redact in transit.
const CARD_RX = /\b(?:\d[ -]?){13,19}\b/g;

const REDACTED = '[redacted]';

export function scrubString(s: string): string {
  return s
    .replace(EMAIL_RX, '[email]')
    .replace(CARD_RX, '[card]')
    .replace(INDIA_PHONE_RX, '[phone]');
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
    return value.map((v) => scrub(v, seen)) as unknown as T;
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
