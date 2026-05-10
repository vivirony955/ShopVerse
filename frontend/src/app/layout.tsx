import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Providers from "@/providers/Providers";
import { OrganizationJsonLd } from "@/components/seo/JsonLd";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://shopverse.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "ShopVerse — Premium Fashion & Lifestyle", template: "%s | ShopVerse" },
  description:
    "Discover the latest in fashion, lifestyle, and accessories. Shop from thousands of brands with free shipping on orders above ₹499.",
  keywords: ["fashion", "clothing", "shoes", "accessories", "online shopping", "India"],
  openGraph: {
    type: "website",
    siteName: "ShopVerse",
    title: "ShopVerse — Premium Fashion & Lifestyle",
    description: "Discover the latest trends in fashion and lifestyle.",
    url: SITE_URL,
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="min-h-screen bg-[#fafafa] font-sans antialiased">
        <OrganizationJsonLd />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
