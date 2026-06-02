// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * Browser-safe, framework-agnostic i18n + currency formatting for the
 * storefront and plugins (plan §10 E16, promoted from placeholder in the
 * global relaunch).
 *
 * `t(key, defaultEn)` keeps its original synchronous signature so every
 * existing plugin call works unchanged — a missing translation degrades
 * gracefully to the embedded English default. Region packs / the storefront
 * register dictionaries and set the active locale at request-init.
 *
 * SSR note: the active locale + dictionaries are module-level. That is correct
 * for a single-tenant, single-default-locale store (v1). True per-request
 * locale negotiation (Accept-Language / user preference / URL prefix) belongs
 * in a request-scoped context and is a follow-up; the public API here does not
 * change when that lands.
 */

/** BCP 47 locale, e.g. "en-US", "hi-IN", "de-DE". */
export type Locale = string;

/** Flat key → translated-string map for one locale. */
export type Dictionary = Readonly<Record<string, string>>;

let activeLocale: Locale = 'en-US';
const dictionaries = new Map<Locale, Record<string, string>>();

/** Set the active locale (negotiated from user/store/Accept-Language at init). */
export function setLocale(locale: Locale): void {
  activeLocale = locale;
}

/** The current active locale. */
export function getLocale(): Locale {
  return activeLocale;
}

/**
 * Register (or merge) translations for a locale. Region packs and the
 * storefront call this at startup; later calls merge over earlier keys.
 */
export function registerTranslations(locale: Locale, dict: Dictionary): void {
  const existing = dictionaries.get(locale) ?? {};
  dictionaries.set(locale, { ...existing, ...dict });
}

/** Test/SSR hygiene: clear all registered translations + reset the locale. */
export function resetTranslations(): void {
  dictionaries.clear();
  activeLocale = 'en-US';
}

/**
 * Translate `key` for the active locale, falling back to `defaultEn` when no
 * translation is registered. Plugins call `t('plugin.x.cta', 'Notify me')`.
 */
export function t(key: string, defaultEn: string): string {
  return dictionaries.get(activeLocale)?.[key] ?? defaultEn;
}

/**
 * Format a monetary amount for display via `Intl.NumberFormat`, keyed on the
 * store currency (ISO 4217) and locale (BCP 47, defaults to the active locale).
 * Replaces hardcoded currency symbols (e.g. ₹) across the storefront. Falls
 * back to "CODE 1234.56" for an unknown currency/locale.
 */
export function formatCurrency(
  amount: number,
  currency: string,
  locale: Locale = activeLocale,
): string {
  const code = currency.toUpperCase();
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}
