// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { ImageResponse } from "next/og";

// Dynamic per-product social card. Branded + text-only (product name +
// store-currency price) so it always renders even if the product image is
// missing or slow. Falls back to a generic card on any fetch error.

export const alt = "Product on ShopVerse";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const STORE_CURRENCY = process.env.NEXT_PUBLIC_STORE_CURRENCY ?? "USD";
const STORE_LOCALE = process.env.NEXT_PUBLIC_STORE_LOCALE ?? "en-US";

function card(name: string, priceLabel: string) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "80px",
        background: "linear-gradient(135deg, #7c3aed 0%, #4338ca 100%)",
        color: "white",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", fontSize: 38, fontWeight: 800 }}>
        <span style={{ marginRight: 16 }}>◆</span>
        <span>ShopVerse</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", maxWidth: 1040 }}>
        <div style={{ display: "flex", fontSize: 60, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1 }}>
          {name}
        </div>
        {priceLabel ? (
          <div style={{ display: "flex", fontSize: 52, fontWeight: 700, marginTop: 28, opacity: 0.95 }}>
            {priceLabel}
          </div>
        ) : (
          <div />
        )}
      </div>

      <div style={{ display: "flex", fontSize: 26, fontWeight: 600, opacity: 0.85 }}>
        View on ShopVerse →
      </div>
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let name = "Shop on ShopVerse";
  let priceLabel = "";

  try {
    const res = await fetch(`${API_URL}/products/${id}`, { next: { revalidate: 60 } });
    if (res.ok) {
      const p = await res.json();
      if (typeof p?.name === "string" && p.name.length > 0) {
        name = p.name.length > 90 ? `${p.name.slice(0, 88)}…` : p.name;
      }
      if (typeof p?.basePrice === "number") {
        const sale = p.basePrice * (1 - (p.discountPct ?? 0) / 100);
        try {
          priceLabel = new Intl.NumberFormat(STORE_LOCALE, {
            style: "currency",
            currency: STORE_CURRENCY,
          }).format(sale);
        } catch {
          priceLabel = `${STORE_CURRENCY} ${sale.toFixed(2)}`;
        }
      }
    }
  } catch {
    // network/parse failure → generic branded card
  }

  return new ImageResponse(card(name, priceLabel), { ...size });
}
