// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { ImageResponse } from "next/og";

// Default social-share image for the site (homepage + any route without
// its own opengraph-image). Branded, text-only — no remote fonts/images,
// so it always renders. Per-product pages override this with a dynamic
// card (see products/[id]/opengraph-image.tsx).

export const alt = "ShopVerse — source-available, correctness-first commerce";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PILLS = [
  "13 DB-enforced invariants",
  "Double-entry ledger",
  "Region-pluggable",
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
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
        <div style={{ display: "flex", alignItems: "center", fontSize: 44, fontWeight: 800 }}>
          <span style={{ marginRight: 18 }}>◆</span>
          <span>ShopVerse</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1 }}>
            Commerce you can&apos;t
          </div>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1 }}>
            oversell by accident.
          </div>
          <div style={{ fontSize: 30, opacity: 0.85, marginTop: 24 }}>
            Source-available · correctness-first · global by design
          </div>
        </div>

        <div style={{ display: "flex" }}>
          {PILLS.map((p) => (
            <div
              key={p}
              style={{
                display: "flex",
                fontSize: 24,
                fontWeight: 600,
                padding: "12px 24px",
                marginRight: 18,
                borderRadius: 999,
                background: "rgba(255,255,255,0.15)",
                border: "1px solid rgba(255,255,255,0.35)",
              }}
            >
              {p}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
