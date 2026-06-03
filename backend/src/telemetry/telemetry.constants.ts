// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * Telemetry constants — env keys, defaults, and the coarse GMV bands.
 *
 * Everything telemetry sends is anonymous and config-level (see
 * `docs/TELEMETRY.md` for the full, audited payload). Operators disable it
 * with a single env var; nothing here ever blocks or slows the app.
 */

/** Env var (truthy) that hard-disables telemetry — operator control, no DB needed. */
export const ENV_DISABLED = 'SHOPVERSE_TELEMETRY_DISABLED';

/** Universal community opt-out standard (https://consoledonottrack.com). Honoured too. */
export const ENV_DO_NOT_TRACK = 'DO_NOT_TRACK';

/** Optional stable anonymous id (pin across ephemeral container redeploys). */
export const ENV_ID = 'SHOPVERSE_TELEMETRY_ID';

/** Optional override for where the generated anonymous id is persisted. */
export const ENV_DIR = 'SHOPVERSE_TELEMETRY_DIR';

/** Optional override for the collector endpoint (e.g. a self-hosted sink). */
export const ENV_ENDPOINT = 'SHOPVERSE_TELEMETRY_ENDPOINT';

/** Default collector endpoint. */
export const DEFAULT_ENDPOINT = 'https://telemetry.shopverse.dev/v1/heartbeat';

/** Filename for the persisted anonymous install id (inside the telemetry dir). */
export const ID_FILENAME = 'telemetry-id';

/** Payload schema tag — bump when the heartbeat shape changes. */
export const HEARTBEAT_SCHEMA = 'shopverse.telemetry.v1';

/** Open-source edition marker. The enterprise/white-label build lives in a separate repo. */
export const EDITION = 'community';

/** Delay before the first heartbeat so startup is never blocked and short-lived
 *  processes (migrations, CLIs, tests) exit before emitting anything. */
export const FIRST_BEAT_DELAY_MS = 60_000;

/** Network timeout for a single heartbeat POST. */
export const SEND_TIMEOUT_MS = 4_000;

/** Trailing window for the coarse GMV band (matches the BSL trailing-12-month gate). */
export const GMV_WINDOW_DAYS = 365;

/**
 * Coarse GMV buckets (in the store's own currency units). Deliberately a band,
 * never a number — enough to power "approaching the $100k gate" upgrade nudges
 * without exporting revenue. Returned as `unknown` if the aggregate can't run.
 */
export type GmvBand =
  | 'lt_1k'
  | '1k_10k'
  | '10k_50k'
  | '50k_100k'
  | 'gte_100k'
  | 'unknown';

/** Map a trailing-window GMV total to its coarse band. */
export function gmvBandOf(total: number): GmvBand {
  if (!Number.isFinite(total) || total < 0) return 'unknown';
  if (total < 1_000) return 'lt_1k';
  if (total < 10_000) return '1k_10k';
  if (total < 50_000) return '10k_50k';
  if (total < 100_000) return '50k_100k';
  return 'gte_100k';
}
