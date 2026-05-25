// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * @shopverse/sdk
 *
 * Typed contracts for ShopVerse plugins. See README + the main repo's
 * `docs/architecture/kernel-boundary.md` for the full plugin model.
 */

// Read-only kernel projections
export * from './types/readonly';

// Contract types
export * from './contracts/hooks';
export * from './contracts/events';
export * from './contracts/strategies';
export * from './contracts/plugin';
export * from './contracts/custom-events';

// Runtime helpers (pure, zero-deps; safe for plugin code + tests)
export * from './runtime/semver';
export * from './runtime/manifest-validator';
export * from './runtime/semaphore';
