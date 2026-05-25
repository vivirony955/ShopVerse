# First-Party Plugins Catalog

The 16 modules slated for migration to the plugin runtime (Tier 3 per
`kernel-boundary.md`). Each entry lists current location, coupling
profile, migration wave, and any prerequisites.

Migration policy: a plugin is migrated when its dependencies are also
migrated (or proven not needed). Waves 2 and 4 cover the zero-coupling
modules first; later waves handle the rest as the event bus and strategy
interfaces mature.

| # | Plugin | Current path | Coupling | Owns Prisma models | Wave |
|---|---|---|---|---|---|
| 1 | `price-alerts` | `backend/src/price-alerts/` | zero non-Prisma | `PriceAlert` | W2 (pilot) |
| 2 | `blog` | `backend/src/blog/` | zero non-Prisma | `BlogPost` | W4 |
| 3 | `price-history` | `backend/src/price-history/` | zero non-Prisma | `PriceHistory` | W4 |
| 4 | `volume-discounts` | `backend/src/volume-discounts/` | zero non-Prisma | `VolumeDiscount` | W4 |
| 5 | `notifications` | `backend/src/notifications/` | one event subscriber | `Notification` | W4 |
| 6 | `referral` | `backend/src/referral/` | one event + uses loyalty | `ReferralCredit` | later |
| 7 | `abandoned-cart` | `backend/src/abandoned-cart/` | two events + email | `AbandonedCart` | later |
| 8 | `flash-sales` | `backend/src/flash-sales/` | event subscriber + admin | `FlashSale`, `FlashSaleProduct` | later |
| 9 | `support` | `backend/src/support/` | admin only | `SupportTicket`, `SupportNote` | later |
| 10 | `affiliate` | `backend/src/affiliate/` | event subscriber + UTM | `AffiliateAccount`, `AffiliateClick` | later |
| 11 | `legal` | `backend/src/legal/` | content only | `Policy`, `CookieConsent` | later |
| 12 | `faqs` | `backend/src/faqs/` | content only | `ProductFaq` | later |
| 13 | `qa` | `backend/src/qa/` | content only | `ProductQuestion` | later |
| 14 | `reviews` | `backend/src/reviews/` | PDP-facing | `Review`, `ReviewVote` | later |
| 15 | `wishlist` | `backend/src/wishlist/` | user-data | `Wishlist` | later |
| 16 | `experience` | `backend/src/experience/` | save-for-later, slots, gifts | `SavedForLater`, `DeliverySlot`, `GiftOption` | later |
| 17 | `analytics` | `backend/src/analytics/` | event consumer (read-only) | (uses kernel data) | later |

Note: count is 16+1 because `analytics` is bonus (no own tables, pure
event consumer) but the policy applies the same way.

## Per-plugin migration checklist (template)

For each plugin moved from `backend/src/<name>/` to `backend/plugins/<name>/`:

- [ ] Plugin schema split into `prisma/schema/<name>.prisma`
- [ ] All imports converted from `@backend/*` to `@shopverse/sdk`
- [ ] ESLint `no-kernel-import` passes
- [ ] Plugin manifest added to `plugins.config.ts`
- [ ] Smoke test in `backend/plugins/<name>/test/smoke.spec.ts` passes
- [ ] Existing integration tests for the module still pass
- [ ] k6 regression < 5% with plugin loaded
- [ ] Plugin can be disabled in manifest without breaking the kernel
- [ ] CHANGELOG entry under `Unreleased / Changed: <plugin> extracted to backend/plugins/`
