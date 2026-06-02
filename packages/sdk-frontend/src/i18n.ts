// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * `t(key, defaultEn)` — i18n placeholder shipped per plan §10 E16.
 *
 * Today, every call returns `defaultEn` unchanged. Plugin authors
 * MUST use this call shape (not bare string literals) so that when
 * ShopVerse adds locale negotiation in a future wave, every existing
 * plugin becomes translatable without a code change.
 *
 * `key` is the lookup identifier (e.g. `"plugin.priceAlerts.cta"`);
 * `defaultEn` is the English fallback that ships embedded in the
 * plugin bundle.
 *
 * Future-compat note: when real i18n lands, this function will read
 * locale from React server context (Next.js request headers) and
 * the plugin-shipped `locales/<lang>.json`. The signature is
 * deliberately synchronous to keep the slot-render path simple —
 * the locale lookup will be resolved at request-init, not per call.
 */
export function t(_key: string, defaultEn: string): string {
  return defaultEn;
}
