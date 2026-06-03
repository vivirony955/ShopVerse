# shopverse-migrate

Migrate to [ShopVerse](https://gitlab.com/aiexperts/ecommWeb) from Shopify or
WooCommerce. Source-available under [Business Source License 1.1](./LICENSE).

Two commands:

- **`import`** — turn a Shopify / WooCommerce **product CSV export** into a
  normalized `shopverse-import.json` you can load into a ShopVerse store.
- **`savings`** — estimate your **annual savings** vs your current platform.

It is **file-based and offline** — no store credentials, no API keys. You
export a CSV from your current platform; this converts it.

## Usage

```bash
# Convert a Shopify product export (auto-detects the platform)
npx shopverse-migrate import products_export.csv

# Force the platform + choose an output path
npx shopverse-migrate import wc-products.csv --platform=woocommerce --out=catalog.json

# Estimate savings (Shopify Basic, using Shopify Payments)
npx shopverse-migrate savings --gmv=250000 --plan=basic
```

## `import`

Export your catalogue first:

- **Shopify** — *Products → Export → All products → CSV* (`products_export.csv`).
- **WooCommerce** — *Products → Export → Export* (the native product CSV).

Then:

```bash
npx shopverse-migrate import <file.csv> [--platform=shopify|woocommerce] [--out=shopverse-import.json]
```

### Field mapping

| ShopVerse | Shopify | WooCommerce |
|---|---|---|
| `name` | `Title` | `Name` |
| `slug` | `Handle` | slugified `Name` |
| `description` | `Body (HTML)` (tags stripped) | `Description` / `Short description` |
| `brand` | `Vendor` | `Brand` (if present) |
| `category` | `Product Category` / `Type` | first `Categories` leaf |
| `basePrice` + `discountPct` | `Variant Price` + `Compare At Price` | `Regular price` + `Sale price` |
| `images` | `Image Src` (across rows) | `Images` |
| `tags` | `Tags` | `Tags` |
| `isActive` | `Published` | `Published` |
| `variants[].size` / `.color` | `Option1/2` (Size/Colour aware) | variation attributes |
| `variants[].sku` / `.stock` | `Variant SKU` / `Inventory Qty` | `SKU` / `Stock` |

**Note:** ShopVerse stores **one price per product** (variants distinguish
size/color/sku/stock, not price). If a product's variants are priced
differently, the first variant's price is used and a warning is emitted.

The output is `{ schema, source, generatedAt, products[], stats, warnings[] }`.
Review the warnings, then load `products[]` via your seed/import script
(resolving `brand`/`category` names to ids).

## `savings`

```bash
npx shopverse-migrate savings --gmv=<n> [--platform=shopify] [--plan=basic|shopify|advanced|plus] \
  [--no-shopify-payments] [--woo-monthly=<n>] [--infra=<n>]
```

It compares **platform-specific** costs only — SaaS subscription + the
platform's own per-transaction fee — against ShopVerse's self-host infra (and
$0 platform fee under the **$100k/yr GMV** gate). Card-processing fees are
**excluded**: you pay those to a processor (Stripe on ShopVerse) on either
platform, so they cancel out — including them would inflate the result.

Every number is a **documented, overridable estimate**; the command prints its
assumptions so you can verify them against your real costs.

## Library API

```ts
import { importProducts, calculateSavings } from 'shopverse-migrate';

const result = importProducts(csvText);            // { products, stats, warnings }
const savings = calculateSavings({ annualGmv: 250000, platform: 'shopify' });
```

---

Part of the ShopVerse project. See the
[root README](https://gitlab.com/aiexperts/ecommWeb) and
[`COMMERCIAL_USAGE.md`](https://gitlab.com/aiexperts/ecommWeb/-/blob/main/COMMERCIAL_USAGE.md).
