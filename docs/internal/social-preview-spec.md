# Social preview image — design brief

Target deliverable: a **1280×640 PNG** that renders as the OG image when
the repo URL is shared on Twitter / LinkedIn / Hacker News.

Hand this brief to a designer or paste it into an AI image generator
(Midjourney, DALL·E, Adobe Express).

---

## Required content

The image must communicate three things at a glance:

1. **The name:** "ShopVerse"
2. **The wedge:** "Multi-warehouse · Financial invariants · India-native"
3. **It's open source:** subtle GitLab/GitHub indicator or "Open Source" tag

## Composition

```
+---------------------------------------------------------------+
|                                                               |
|    [LOGO MARK]    ShopVerse                                   |
|                                                               |
|    Open-source ecommerce infrastructure                       |
|    with double-entry financial correctness                    |
|                                                               |
|    Multi-warehouse  ·  India-native  ·  687 tests             |
|                                                               |
|                                  Business Source License 1.1          |
+---------------------------------------------------------------+
       Left 60% = type     Right 40% = product/abstract visual
```

## Visual style

- **Primary palette:** Deep violet (`#7e3df0`) on near-black
  (`#0d0d12`), or inverted (violet background, off-white text).
- **Accent:** A single warm accent (saffron `#ff9933` or coral `#ff5e5b`)
  to nod at the India-native angle without being literal.
- **Avoid:** flag imagery, generic shopping-cart icons, stock photography.

## Typography

- **Wordmark:** Sans-serif, weight 700+, large. Inter, Geist, or Söhne.
- **Tagline:** Same family, weight 400, half the wordmark size.
- **Microcopy ("Business Source License 1.1"):** weight 400, small, low-contrast.

## What to put in the right 40%

Pick one (in priority order):

1. **Abstract diagram** of an inventory ledger — boxes with arrows, in the
   same violet, faded to 30% opacity behind the text. Hints at "real
   architecture" without being a literal screenshot.
2. **Stylized order-state-machine** glyph (5 nodes, directional arrows).
3. **A simplified Indian-state-map outline** with three highlighted dots
   (Mumbai, Delhi, Bengaluru) representing warehouses. Use sparingly to
   avoid jingoism.
4. **Pure typography** — no right-side art, just generous whitespace.
   This is the safe fallback if no designer is available.

## What NOT to include

- Stock-photo people holding shopping bags.
- Generic e-commerce iconography (carts, credit cards, packages).
- The word "Shopify" or any competitor's name.
- Emoji.
- Three or more font families.

## Alternative deliverables (nice-to-haves)

- A **square 512×512 version** for GitHub avatar / GitLab project icon.
- A **dark mode** and **light mode** variant.

## Acceptance check

Before uploading, view the image at 50% size (640×320, the OG-card render
size on Twitter). If the wordmark or tagline is illegible at that size,
the type is too small or the contrast is too low.

---

## Where to upload

- **GitLab:** Settings → General → Project avatar.
- **GitHub mirror:** Settings → Social preview → Upload an image.
- **README hero:** Optionally embed at the top of `README.md` (Markdown:
  `![ShopVerse](docs/social-preview.png)`).
