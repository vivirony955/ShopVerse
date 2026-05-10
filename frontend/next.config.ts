import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for the multi-stage Docker build: produces .next/standalone
  // which contains a self-contained server.js with only runtime deps.
  output: "standalone",
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
};

export default nextConfig;
