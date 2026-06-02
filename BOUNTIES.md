# ShopVerse Bounties

> Get paid to extend ShopVerse where it matters most: region packs, payment gateways, and high-impact features.

ShopVerse is built to be global, but no single team can localize it for every market. Bounties fund the community to fill the gaps — and the people who build a region pack or gateway become its best advocates in that market.

**Claim a bounty or propose one: open an issue, or email vivironycrazy@gmail.com**

---

## Where bounties focus

The highest-value extensions are **region packs** and **payment gateways** — each unlocks a whole market:

| Area | Examples | Why it's wanted |
|---|---|---|
| **Region packs** | `shopverse-eu` (VAT/MOSS), `shopverse-ca`, `shopverse-au`, `shopverse-br` | Tax + address + locale for a country, plugged into the kernel via `TaxStrategy` (see `backend/plugins/shopverse-us` for the template). |
| **Payment gateways** | Razorpay, Mercado Pago, PayU, Paystack, Flutterwave | A `PaymentGatewayStrategy` implementation so stores in non-Stripe markets can take payment. |
| **Vertical packs** | B2B (quotes/PO/net-terms), subscriptions, serialized/warranty goods | Capabilities specific verticals need, built on the plugin contract. |
| **Storefront / DX** | Themes, deploy templates, localization dictionaries | Lower the 0-to-store friction. |

## How it works

1. **Find or propose** — browse open bounties (issues labeled `bounty`) or propose a new one with a short spec.
2. **Claim** — comment to claim; we confirm scope, acceptance criteria, and the award.
3. **Build** — follow the plugin author guide ([docs/plugins/guide.md](docs/plugins/guide.md)); a region pack mirrors `backend/plugins/shopverse-us/` (a flat-GST example is `shopverse-india`).
4. **Submit** — open a PR (sign the [CLA](CLA.md)); it must pass the standard gates (tsc, lint, tests).
5. **Get paid + credited** — on merge, the bounty is paid and you're credited as the pack's author (a first-class evangelist for that market).

## Acceptance bar

- Implements the relevant strategy contract from `@shopverse/sdk` (`TaxStrategy`, `PaymentGatewayStrategy`, …).
- Follows the plugin conventions ([docs/plugins/conventions.md](docs/plugins/conventions.md)) and passes `no-kernel-import`.
- Tests for the core logic; green CI.
- A short README in the pack explaining configuration.

New to the plugin model? Start with the 10-minute tutorial: [docs/plugins/tutorial.md](docs/plugins/tutorial.md).
