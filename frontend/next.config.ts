import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Required for the multi-stage Docker build: produces .next/standalone
  // which contains a self-contained server.js with only runtime deps.
  output: "standalone",
  // The Docker build context is the repo root, so two lockfiles sit in the
  // tree (frontend/ + packages/sdk-frontend/). Without an explicit root,
  // Next would infer /app as a monorepo root and emit
  // .next/standalone/frontend/server.js. Pin it to this dir so the output
  // stays flat (server.js at the standalone root) — what the runner stage
  // of frontend/Dockerfile copies.
  outputFileTracingRoot: path.join(__dirname),
  // Exclude plain .ts files from the Pages Router scanner.
  // This prevents src/pages/api/auth/[...nextauth].ts from conflicting
  // with the App Router version at src/app/api/auth/[...nextauth]/route.ts.
  // pageExtensions only affects Pages Router — App Router route.ts files
  // are unaffected and continue to work normally.
  pageExtensions: ["tsx", "jsx", "js"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "cdn.shopify.com" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "via.placeholder.com" },
      { protocol: "https", hostname: "fakestoreapi.com" },
      { protocol: "https", hostname: "i.imgur.com" },
      { protocol: "https", hostname: "placehold.co" },
      { protocol: "https", hostname: "picsum.photos" },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  // The plugin SDK is consumed via `file:../packages/sdk-frontend` in
  // frontend/package.json — npm creates a symlink at
  // frontend/node_modules/@shopverse/sdk-frontend. Webpack follows
  // that symlink fine, but Turbopack (`next dev --turbopack`) refuses
  // to resolve dist/* of a symlinked workspace dep unless the package
  // is declared in transpilePackages. Without this, every PDP that
  // loads HelloWidget.tsx → @shopverse/sdk-frontend gives
  // "Module not found", and that error cascades through every page
  // sharing the slot registry — surfaced as 49/218 Playwright fails
  // on the first local run.
  transpilePackages: ["@shopverse/sdk-frontend", "@shopverse/sdk"],
};

export default nextConfig;
