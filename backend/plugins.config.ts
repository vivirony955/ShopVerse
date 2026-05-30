// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
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
  ],
};

export default pluginsConfig;
