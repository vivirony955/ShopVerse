// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import type { EDITION, GmvBand, HEARTBEAT_SCHEMA } from './telemetry.constants';

/**
 * The anonymous heartbeat — a STRICT allowlist. Every field is either a random
 * id, a coarse band, an OS-level fact, or store-level *configuration*. There is
 * no customer data, no counts of users/orders, no hostnames, no URLs, no
 * free-text. The allowlist (not a scrubber) is the privacy guarantee; the
 * scrubber is used in tests only, as an oracle proving zero PII patterns.
 *
 * Documented in full at `docs/TELEMETRY.md`.
 */
export interface Heartbeat {
  /** Payload schema version. */
  schema: typeof HEARTBEAT_SCHEMA;
  /** Random per-install id. Not derived from any PII; lets the sink count
   *  unique installs (k-factor) without identifying anyone. */
  anonymousId: string;
  /** ISO timestamp this heartbeat was built. */
  sentAt: string;
  /** Open-source build marker. */
  edition: typeof EDITION;
  /** ShopVerse version (coarse adoption-by-version signal). */
  version: string;
  /** OS-level runtime facts — non-identifying. */
  runtime: {
    node: string;
    platform: string;
    arch: string;
  };
  /** Store-level CONFIGURATION (not customer data). */
  store: {
    currency: string; // ISO 4217
    country: string; // ISO 3166-1 alpha-2 (store config, not a customer address)
    region: string; // active region pack id
    locale: string; // BCP 47
  };
  /** Coarse revenue band — never an exact number. */
  gmvBand: GmvBand;
  /** Ecosystem signal: how many plugins are enabled + which region pack. */
  plugins: {
    enabledCount: number;
    regionPack: string;
  };
}
