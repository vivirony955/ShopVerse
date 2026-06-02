// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { t } from '@shopverse/sdk-frontend';

/**
 * W6.T10 tutorial widget. Pure render — no `'use client'` needed,
 * no hooks, no fetch. Demonstrates the minimal slot shape from
 * docs/plugins/tutorial.md step 4.
 */
export function HelloWidget({ productId }: { productId: number }) {
  return (
    <p className="text-sm text-violet-600 mt-2">
      {t('hello.cta', `👋 Hello from a plugin — product #${productId}`)}
    </p>
  );
}

export default HelloWidget;
