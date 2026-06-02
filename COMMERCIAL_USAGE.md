# ShopVerse — Commercial Usage Policy

ShopVerse is licensed under the [Business Source License 1.1 (BSL)](LICENSE), with an Additional Use Grant that makes it **free for production use until you are a real business**. Each released version converts to **Apache 2.0** three years after its publication.

**TL;DR:** If your organization processes **less than USD $100,000 GMV** (Gross Merchandise Value) through ShopVerse in any trailing 12-month period, production use is **free** — keep the "Powered by ShopVerse" badge and you owe nothing. Cross $100k GMV, remove the badge, or offer ShopVerse as a hosted service to others, and you need a commercial license.

For licensing: **vivironycrazy@gmail.com**

---

## Free Use (No Commercial License Required)

| Use case | Allowed | Notes |
|---|---|---|
| Production store under **$100k trailing-12-mo GMV** | ✅ | Keep the "Powered by ShopVerse" badge |
| Any non-production use (dev, test, evaluation, demo) | ✅ | No limit |
| Learning, teaching, academic / course use | ✅ | Educational |
| Personal or non-profit project with zero revenue | ✅ | Non-commercial |
| Contributing to ShopVerse (PRs, fixes, docs) | ✅ | Under the CLA + BSL |
| Building plugins / region packs / vertical packs | ✅ | The SDK is free |
| Any version older than its 3-year Change Date | ✅ | That version is Apache 2.0 |

---

## Commercial License Required

| Use case | Required | Why |
|---|---|---|
| Production store **at or above $100k trailing-12-mo GMV** | ✅ | Above the Additional Use Grant threshold |
| Removing / hiding the "Powered by ShopVerse" badge | ✅ | White-label is a paid capability |
| Offering ShopVerse (or its features) as a hosted/managed commerce service to third parties | ✅ | The core BSL restriction |
| White-labeling ShopVerse under another brand | ✅ | Resale / rebranding |
| Enterprise-only modules (multi-tenant, SSO/SAML, advanced analytics, etc.) | ✅ | Closed `shopverse-enterprise` layer |

---

## How the GMV threshold works

- **GMV** = the total gross value of orders processed through ShopVerse across all of your deployments, before refunds, summed over the trailing 12 months.
- It is measured **per organization** (you and entities under common control), not per store.
- The threshold is **USD $100,000**. Other currencies are converted at a reasonable spot rate at time of measurement.
- The check is **honor-based**, backed by the license and by the closed enterprise layer + white-label, which require a paid key. We are not in the business of auditing small stores — grow past the line and upgrade.

## Edge cases

- **"I just crossed $100k mid-year."** Get a Growth-tier license at your next convenient billing point; the entry tier is intentionally cheap so this is a step, not a wall.
- **"I'm an agency deploying for clients."** Each client deployment is evaluated on that client's GMV. Agencies should look at the **Partner Program** (PARTNERS.md) for revenue-share + certified status.
- **"I want to remove the badge but I'm under $100k."** That requires a white-label commercial license even below the threshold — the badge is how ShopVerse stays free for everyone else.
- **"We're internal-only / no external sales."** If there is no GMV (no sales through ShopVerse), production use is free regardless of company size.

See [COMMERCIAL_LICENSE.md](COMMERCIAL_LICENSE.md) for tiers and pricing, and [LICENSE](LICENSE) for the binding terms.
