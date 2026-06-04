// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

"use client";

import { createContext, useContext } from "react";

/**
 * App-wide "should the Powered-by-ShopVerse badge be hidden?" flag.
 *
 * Resolved ONCE, server-side, in the root layout via the license entitlements
 * endpoint, then broadcast to client components through context. This keeps the
 * entitlements call out of the browser entirely.
 *
 * Why this exists: Footer used to be an async server component that awaited
 * `canHideBadge()`. The homepage (`src/app/page.tsx`) is a client component and
 * imports Footer, so Footer got pulled into the client bundle — where an async
 * component re-fetches on every render. That produced an infinite loop of
 * `GET /enterprise/entitlements` calls that stalled client-side navigation
 * (e.g. the post-login `router.push("/")` never settled). Resolving the flag
 * server-side and reading it via context removes the loop.
 */
const HideBadgeContext = createContext<boolean>(false);

export function HideBadgeProvider({
  value,
  children,
}: {
  value: boolean;
  children: React.ReactNode;
}) {
  return <HideBadgeContext.Provider value={value}>{children}</HideBadgeContext.Provider>;
}

/** True only when a valid WHITE_LABEL license grants badge removal. */
export function useHideBadge(): boolean {
  return useContext(HideBadgeContext);
}
