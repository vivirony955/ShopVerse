# ShopVerse End-User Guide

This guide is for the **two human users** of a deployed ShopVerse
instance: **shoppers** (people buying products) and **store
operators** (admins running the storefront). It is not a developer
or contributor guide — for those, see `CONTRIBUTING.md` and
`docs/plugins/`.

Screenshots referenced here live in
[`docs/screenshots/`](screenshots/).

---

## Part 1 — Shopper guide

Everything a shopper does, in the order they typically do it.

### 1. Browsing the catalog

- **Home page** ([01-home.png](screenshots/01-home.png)) — featured
  collections, trending products, flash sales banner, blog
  highlights.
- **Product listing** (PLP) — landing from category clicks, search,
  or the navbar.
  - Filters (left rail): brand, category, price range, size, color,
    rating.
  - Sort (top-right): relevance, price (low → high / high → low),
    rating, newest.
  - Search bar with autocomplete; supports typo tolerance and
    phrase matching.
- **Comparing products** — add up to 4 products to the compare tray
  via the "Compare" icon on a card. The compare page shows a side-by-
  side feature grid.

### 2. Product detail page (PDP)

- Image gallery with hover-zoom + size chart pop-up
- Variant selector (size → colour) with per-variant stock indicator
- "Notify me on price drop" — get an email when the price falls 10%+
- Volume discount banner if buying in bulk reduces unit price
- Customer Q&A section — submit a question; admins moderate
- Reviews with star rating, photos, and "helpful" votes
- Cross-sell ("People also bought") + upsell ("Add ₹200, get free
  delivery") + bundle ("Frequently bought together")

### 3. Cart + checkout

- **Cart drawer** — opens from any page; line items, quantities,
  apply coupon, see wallet balance.
- **Cart reservation** — clicking "Checkout" reserves the inventory
  for 15 minutes ([cart-checkout flow](screenshots/09-checkout.png)).
  If you abandon the cart, the reservation releases automatically.
- **Address** — pick from saved or add new. Pincode serviceability
  check happens here.
- **Delivery slot** — pick a time window (Today 4–6 PM, Tomorrow
  10–12 AM, etc.). Slot capacity is enforced; full slots are
  greyed out.
- **Payment**:
  - Credit / debit card (Stripe)
  - UPI (Stripe Indian mandate path)
  - Cash on Delivery (COD)
  - Wallet (full or split with another method)
- **Coupon** — apply at the cart or checkout step. Stackable
  discounts apply in declared priority order.
- **Place order** — you get an order confirmation email immediately;
  the order status starts at "Placed".

### 4. Order lifecycle

States from a shopper's perspective:

| State | What's happening |
|---|---|
| Placed | Order accepted; inventory reserved |
| Confirmed | Payment captured (or COD acknowledged) |
| Packed | Warehouse has picked + packed your order |
| Shipped | Tracking code issued; in transit |
| Delivered | Package received; loyalty points credited |
| Cancelled | You cancelled OR fraud check blocked (refund issued) |

You can cancel a Placed or Confirmed order from your Orders page.
Once Shipped, return is the path.

### 5. Returns + refunds

- Request a return from your Orders page within 7 days of delivery.
- Choose: full return (whole order) or partial (specific items).
- Pick reason (size, defect, not as described, etc.).
- Pickup is scheduled; you'll get an email with the slot.
- Refund issued after quality check at the warehouse:
  - **Wallet** — instant credit (recommended; use for next order)
  - **Original payment method** — 1–3 business days for card / UPI

### 6. Wallet + loyalty

- **Wallet balance** — visible top-right of every page; built up
  from refunds, cashback, referrals.
- **Loyalty points** — earned on every delivery. Auto-redeem to wallet
  when a tier threshold is hit (Bronze → Silver → Gold → Platinum).
- **Referrals** — share your unique link; you and your friend both
  get wallet credit when they place their first order.

### 7. Flash sales

- Time-limited; banner on home + a dedicated `/flash-sales` page.
- Reserving your item locks the price for 15 minutes — even if the
  sale ends during your checkout.
- Per-user cap is enforced (typically 1 unit per user per flash
  sale).

### 8. Account + profile

- Saved addresses, payment methods, wishlist
- Order history, return / exchange requests
- Notifications inbox (price alerts, order updates)
- Loyalty tier + points + redemption history
- Newsletter + marketing preferences

### 9. Support

- "Need help?" link on every order → opens a support ticket scoped
  to that order.
- Chat / WhatsApp escalation path from the ticket page.

---

## Part 2 — Store-operator guide

Everything an admin does. Operators have a `Role.ADMIN` (or a more
specific role like `Role.CS_AGENT` / `Role.FINANCE`) on their user
account.

### 1. Dashboard ([16-dashboard.png](screenshots/16-dashboard.png))

- Today's revenue, order count, AOV (average order value)
- Pending fulfilments, low-stock alerts, fraud flags
- Quick-access cards to every admin area

### 2. Products

- Create / edit single products with variants, images, videos,
  specifications, size chart, FAQs, attributes for SEO.
- **Bulk upload** — CSV import with validation; tracks per-row errors.
- Discontinue (soft-delete) keeps history while removing from PLP.

### 3. Inventory ([inventory page]:18-inventory.png)

- Set stock per warehouse (multi-warehouse from day 1).
- Reserved vs available is shown live — reservations come from active
  carts.
- Low-stock alerts trigger when available drops below the threshold
  (per-variant configurable).

### 4. Orders ([orders page](screenshots/24-admin-orders.png))

- View all orders with filters by status, date, customer, payment
  method.
- Mark shipped → enter tracking code → status auto-advances.
- Cancel an order (refunds issued automatically per the cancel
  policy).
- Force-pick a different warehouse if the auto-routing isn't optimal.

### 5. Refunds + returns ([26-refunds.png](screenshots/26-refunds.png))

- Returns queue: incoming pickup requests, photos from customers.
- CS agent raises a refund request → admin approves (maker-checker
  for refunds over ₹5,000 per plan §16.2).
- Refund executes automatically:
  - Wallet refunds: instant
  - Stripe refunds: async, status visible until cleared

### 6. Fraud console ([26-fraud.png](screenshots/26-fraud.png))

- Every order is scored before placement. High-risk orders are
  auto-flagged.
- Manual review: see the flag reasons (mismatched IP, multiple cards,
  velocity, etc.).
- Actions: approve, block, blacklist the user / email / IP.

### 7. Coupons + flash sales

- Create coupons with discount type (% / flat / cashback), per-user
  cap, total cap, expiry, scope (category / brand / product).
- Flash sales: select products, set the time window + per-user cap +
  total inventory cap.

### 8. Categories + brands

- Hierarchical categories with custom imagery, SEO meta, and
  ordering.
- Brand pages with logo + about + product list.

### 9. Users + impersonate

- View users, role, signup source, lifetime value, last order.
- **Impersonate** — admin can act as a user (audited via
  `AdminAuditLog`) to debug an issue from the shopper's perspective.

### 10. Analytics + finance

- Revenue / orders / AOV trends; segmentation by channel.
- Cohort retention, funnel analytics (browse → cart → checkout →
  placed).
- Refund rates, cancellation rates, discount % of GMV.
- CSV / PDF export.

### 11. Audit log

- Every admin write surfaces in `AdminAuditLog` with operator,
  action, target, timestamp.
- Filter by operator, by target type, by date range. Plugin-emitted
  actions carry the plugin id.

### 12. Plugins ([admin-plugins page]) — **NEW in W6**

- Table of every loaded plugin with load status + operator state.
- One-click **Disable** flips the Redis kill-switch — the plugin's
  hooks, events, and crons skip from the next request without a
  redeploy. The plugin module stays in the DI graph.
- One-click **Enable** restores.
- For a permanent removal, edit `backend/plugins.config.ts` and
  rebuild the container — the page documents this in its footer.

### 13. Warehouses ([20-warehouses page](screenshots/20-warehouses.png))

- Add / edit warehouses with addresses, pincode coverage, capacity,
  active hours.
- Per-warehouse inventory view + transfer between warehouses.

### 14. Error logs

- Real-time admin error log (kernel + plugin attributed).
- Filter by level (warn / error / fatal); mark resolved when
  addressed.

---

## Part 3 — Operator setup guide

If you are the operator setting up a fresh ShopVerse deployment for
your store, follow these steps in order. (Developer-level setup is
in [QUICKSTART.md](../QUICKSTART.md); this section is the operator's
day-zero playbook.)

### Day 0: pre-launch

1. **Stripe account** — connect a live Stripe account; capture the
   webhook signing secret.
2. **Email transport** — configure SMTP (transactional emails go
   through it). Test the welcome / order-confirm / shipping
   templates render with your branding.
3. **Pincode serviceability** — bulk-import the pincodes you deliver
   to via CSV.
4. **Warehouses** — add at least one. Set its pincode coverage.
5. **Admin user** — create the founding admin account; promote it to
   `Role.ADMIN`.
6. **Categories + brands** — set up the initial taxonomy. Don't be
   afraid to start small; you can always add more.
7. **Branding** — set the storefront name, logo, primary colour,
   contact email, social links via the admin settings page.

### Day 1: first products

1. **Bulk-upload** the catalog via CSV (admin → products → bulk
   upload). Validate the dry-run report before committing.
2. **Inventory** — set initial stock per warehouse per variant.
3. **Pricing** — confirm base prices + discount %; check
   tax-inclusive vs tax-exclusive policy.
4. **Test order** — place a real order through the storefront with
   your own card. Verify the email + the admin order view + the
   refund path back to your card.

### Day 7: first reconciliation

1. **Finance dashboard** — verify the Stripe payouts reconcile with
   the orders shown. Any unreconciled payment should be flagged.
2. **Refund queue** — clear any refund requests from the first week.
3. **Fraud flags** — review any auto-flagged orders.

### Ongoing

- **Daily**: order fulfilment, refund queue, fraud queue.
- **Weekly**: low-stock report, top-products analytics, coupon
  performance.
- **Monthly**: cohort retention, refund-rate trend, plugin updates
  (if any).

---

## Frequently asked questions

**Q: I'm a shopper and my order says "Cancelled — refund issued". When
will I see the refund?**

If you paid by wallet or chose wallet refund: the credit is
immediate. Check your wallet page.

If you paid by card or UPI: refunds typically post in 1–3 business
days. If 5 business days pass with no refund, contact support and
include your order number.

**Q: I'm an admin and a plugin is misbehaving. How do I disable it
fast?**

Admin → Plugins → click "Disable" on the row. The plugin's hooks,
events, and crons stop on the next request — no rebuild required.
The plugin's old data stays in the database; the page is reversible
(click Enable to restore).

For a hard removal, edit `backend/plugins.config.ts` and rebuild the
container. To drop the plugin's data, run
`npx shopverse plugin:uninstall <id> --drop-data` against your
database after the container rebuild.

**Q: I'm a shopper and the price-alert email said the price dropped,
but the PDP shows the old price. Why?**

Two possible causes:

1. The price increased again between when the alert was sent and when
   you visited (rare but possible — alerts are based on historical
   data).
2. A regional / variant-specific price differs from the one you set
   the alert on. Check the variant + delivery pincode.

If neither, file a ticket from your Orders page and we'll
investigate.

**Q: I'm an admin. A customer reports their wallet balance changed
unexpectedly. Where do I look?**

Admin → Audit log → filter by the customer's user id. Every wallet
credit / debit has a `WalletTransaction` row with a `reference`
field. Cross-reference the reference with the source operation
(order id, refund id, coupon id, etc.). The double-entry ledger
guarantees the wallet balance equals the sum of transactions —
violations are caught by the I-3 invariant check.

**Q: I'm a shopper. I added an item to the cart and it disappeared
when I came back hours later. Why?**

Cart reservations expire after 15 minutes of inactivity for hot
items (flash sale, low stock). Regular cart items persist for 7 days.
If you abandoned the cart at checkout, the reservation released to
free inventory for other shoppers.

---

## See also

- [QUICKSTART.md](../QUICKSTART.md) — developer setup
- [README.md](../README.md) — project overview
- [SYSTEM_DESIGN_FINAL.md](../SYSTEM_DESIGN_FINAL.md) — architecture
- [docs/plugins/](plugins/) — plugin extension model
- [docs/screenshots/](screenshots/) — 28 reference screenshots
