// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import type { PluginManifest } from '@shopverse/sdk';

/**
 * First-party plugin manifest — plan §10 E1.
 *
 * Read at AppModule decoration time by `resolvePluginModules`
 * (`backend/src/common/plugin-module-resolver.ts`) to populate the
 * kernel's `imports:` array. Edit this file to add, remove, or toggle
 * plugins; rebuild the container image to take effect (no runtime
 * hot-loading per plan §8 governance + §10 E2 runtime-disable note).
 *
 * `workspacePath` is relative to `backend/` (this file's directory).
 *
 * Lives OUTSIDE `backend/src/` deliberately — `src/` is the kernel
 * surface area; the manifest is a build-time artifact, not kernel code.
 * This file is to backend's repo what `next.config.js` is to a Next.js
 * app: configuration, not implementation.
 */
const pluginsConfig: PluginManifest = {
  // Bumped per breaking SDK contract changes — kernel boot validates
  // each plugin's declared peer dep against this. Mismatch → plugin
  // skipped + ERROR logged, boot continues (plan §10 E3).
  kernelVersion: '0.1.0-alpha.1',
  plugins: [
    {
      id: '@shopverse/plugin-price-alerts',
      source: 'workspace',
      // Resolved relative to backend/ — see plugin-module-resolver.
      workspacePath: './plugins/price-alerts/src',
      enabled: true,
    },
    {
      id: '@shopverse/plugin-blog',
      source: 'workspace',
      workspacePath: './plugins/blog/src',
      enabled: true,
    },
    {
      id: '@shopverse/plugin-price-history',
      source: 'workspace',
      workspacePath: './plugins/price-history/src',
      enabled: true,
    },
    {
      id: '@shopverse/plugin-volume-discounts',
      source: 'workspace',
      workspacePath: './plugins/volume-discounts/src',
      enabled: true,
    },
    {
      id: '@shopverse/plugin-notifications',
      source: 'workspace',
      workspacePath: './plugins/notifications/src',
      enabled: true,
    },
    {
      // W6.T10 tutorial plugin — exercises hook + event + frontend slot
      // in ~100 LOC. Paired with docs/plugins/tutorial.md.
      id: '@shopverse/plugin-hello-world',
      source: 'workspace',
      workspacePath: './plugins/hello-world/src',
      enabled: true,
    },
    {
      // Global relaunch Phase 2 — India region pack: registers a flat-GST
      // TaxStrategy. Operators on other regions disable this and enable their
      // own pack; with no region pack, orders fall back to StoreSettings.taxRate.
      id: '@shopverse/plugin-india',
      source: 'workspace',
      workspacePath: './plugins/shopverse-india/src',
      enabled: true,
    },
    {
      // US region pack — destination-based (per-state) sales-tax TaxStrategy.
      // DISABLED by default: TaxStrategy is single-mode, so only one region
      // pack may be active. A US operator sets enabled:true here and
      // enabled:false on plugin-india above.
      id: '@shopverse/plugin-us',
      source: 'workspace',
      workspacePath: './plugins/shopverse-us/src',
      enabled: false,
    },
  ],
};

export default pluginsConfig;
