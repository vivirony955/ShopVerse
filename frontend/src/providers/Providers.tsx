// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { useState, useEffect } from "react";
import CartSidebar from "@/components/cart/CartSidebar";

// PostHog is loaded dynamically and not in lib.dom — describe the
// minimal surface we put on `window` so the rest of the codebase
// (e.g. lib/api.ts's analytics tracker) gets autocomplete.
interface WindowWithPostHog {
  posthog?: { capture?: (event: string, props?: Record<string, unknown>) => void };
  __posthog_init?: boolean;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || typeof window === "undefined") return;
    import("posthog-js")
      .then((mod) => {
        const posthog = mod.default;
        const w = window as unknown as WindowWithPostHog;
        if (!w.__posthog_init) {
          posthog.init(key, {
            api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
            capture_pageview: true,
            persistence: "localStorage",
          });
          w.posthog = posthog;
          w.__posthog_init = true;
        }
      })
      .catch(() => {}); // posthog-js not installed yet — silent no-op
  }, []);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            retry: 1,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        <CartSidebar />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              borderRadius: "12px",
              background: "#1e293b",
              color: "#f8fafc",
              fontSize: "14px",
            },
            success: { iconTheme: { primary: "#a78bfa", secondary: "#fff" } },
            error: { iconTheme: { primary: "#f87171", secondary: "#fff" } },
          }}
        />
      </QueryClientProvider>
    </SessionProvider>
  );
}
