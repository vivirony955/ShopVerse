# ShopVerse — Master Tracker

**Owner**: Vivek Negi  
**Last updated**: 2026-05-10  
**Single source of truth** for all implementation status, QA coverage, security hardening, and launch readiness.

---

## Quick Status

| Area | Total | Done | Remaining | Status |
|---|---|---|---|---|
| Phase 1 features | 21 | 21 | 0 | ✅ COMPLETE |
| Phase 2 features | 23 | 11 | 12 | 🟡 Partial |
| Phase 3 features | 12 | 2 | 10 | 🟡 Partial |
| Phase 4 features | 10 | 3 | 7 | 🟡 Partial |
| Security H1+H2 | 30 | 30 | 0 | ✅ COMPLETE |
| Security H3 | 14 | 0 | 14 | ⏭ Phase 2 |
| Backend tests | 638 | 638 | ~55 gaps | ✅ 80% coverage |
| Frontend E2E | 215 | 215 | 0 | ✅ Written |
| Infra YOU tasks | 9 | 0 | 9 | 🔴 Needs you |

---

## 1 — Feature Implementation

### Phase 1: MVP+ Launch — ALL DONE ✅

| ID | Feature | Stack | Status | Key Files |
|---|---|---|---|---|
| F1-01 | PostgreSQL Full-Text Search (tsvector + GIN) | FULL | ✅ DONE | `products.service.ts` |
| F1-02 | Autocomplete with thumbnails + price + brand | FULL | ✅ DONE | `products.service.ts`, `Navbar.tsx` |
| F1-03 | Faceted filter counts ("Nike (42)") | FULL | ✅ DONE | `products.service.ts`, `ProductFilters.tsx` |
| F1-04 | Recently viewed products (server-persisted) | FULL | ✅ DONE | `experience.service.ts` |
| F1-05 | Image zoom on hover/pinch | FE | ✅ DONE | `ProductDetailClient.tsx` |
| F1-06 | Size chart data model + modal | FULL | ✅ DONE | `schema.prisma`, `ProductDetailClient.tsx` |
| F1-07 | Product specifications table (JSON field) | FULL | ✅ DONE | `schema.prisma`, product DTOs, PDP |
| F1-08 | Verified purchase badge on reviews | FULL | ✅ DONE | `reviews.service.ts`, PDP |
| F1-09 | Review helpfulness voting (thumbs up/down) | FULL | ✅ DONE | `reviews.service.ts`, PDP |
| F1-10 | Product videos (`videos String[]`) | FULL | ✅ DONE | `schema.prisma`, PDP |
| F1-11 | robots.txt | FE | ✅ DONE | `frontend/src/app/robots.ts` |
| F1-12 | Canonical URLs on PDP/PLP | FE | ✅ DONE | PDP/PLP `page.tsx` |
| F1-13 | Enhanced JSON-LD (FAQPage, AggregateRating) | FE | ✅ DONE | `JsonLd.tsx`, PDP |
| F1-14 | Delivery slot picker in checkout | FE | ✅ DONE | `checkout/page.tsx` |
| F1-15 | Split payment (Wallet + Card) | FULL | ✅ DONE | `orders.service.ts`, `checkout/page.tsx` |
| F1-16 | Address autocomplete (India Post pincode API) | FE | ✅ DONE | `checkout/page.tsx` |
| F1-17 | Skeleton loading for all pages | FE | ✅ DONE | `Skeleton.tsx`, page files |
| F1-18 | Social sharing (Web Share API) | FE | ✅ DONE | `ProductDetailClient.tsx` |
| F1-19 | Infinite scroll on PLP | FE | ✅ DONE | `ProductsClient.tsx` |
| F1-20 | Bulk product upload (CSV) | FULL | ✅ DONE | `products.controller.ts`, `admin/products/bulk-upload/` |
| F1-21 | Admin reports export (CSV/PDF) | FULL | ✅ DONE | `admin.controller.ts`, `admin/finance/page.tsx` |

### Phase 2: Growth — 11/23 Done

| ID | Feature | Stack | Status | Notes |
|---|---|---|---|---|
| F2-01 | Razorpay (UPI/cards/wallets) | FULL | 🔴 TODO | Critical for India — 70%+ payments are UPI |
| F2-02 | UPI payment (via Razorpay) | FULL | 🔴 TODO | Depends on F2-01 |
| F2-03 | Saved payment methods | FULL | 🔴 TODO | Depends on F2-01 |
| F2-04 | EMI / Buy Now Pay Later | FULL | 🔴 TODO | Depends on F2-01 |
| F2-05 | Social login (Google + Apple) | FULL | 🔴 TODO | NextAuth CredentialsProvider only right now |
| F2-06 | In-app notification center | FULL | ✅ DONE | `notifications/`, `Navbar.tsx` |
| F2-07 | Web push notifications | FULL | 🟡 TODO | Depends on F2-06 (done) |
| F2-08 | WhatsApp order updates | BE | 🔴 TODO | Needs MSG91/Gupshup Business API |
| F2-09 | SMS notifications | BE | 🟡 TODO | Needs MSG91/Twilio |
| F2-10 | Meilisearch (replaces PostgreSQL FTS) | FULL | 🟡 TODO | Needs Meilisearch infra |
| F2-11 | Trending/popular searches | FULL | ✅ DONE | `SearchLog` model, `products.service.ts` |
| F2-12 | Exchange flow (swap product) | FULL | ✅ DONE | `exchange/`, order detail page |
| F2-13 | Delivery feedback/rating | FULL | ✅ DONE | `DeliveryRating` model, order detail page |
| F2-14 | Customer Q&A | FULL | ✅ DONE | `qa/`, PDP |
| F2-15 | Review photos/videos | FULL | 🟡 TODO | Needs S3/Cloudinary file storage |
| F2-16 | Product bundles / combo deals | FULL | 🟡 TODO | Complex dependency graph |
| F2-17 | Price drop alerts | FULL | ✅ DONE | `price-alerts/`, PDP |
| F2-18 | Bank-specific offers | FULL | 🔴 TODO | Needs Razorpay BIN data (F2-01 first) |
| F2-19 | Tiered loyalty (Silver/Gold/Platinum) | FULL | ✅ DONE | `LoyaltyTier` model, loyalty page |
| F2-20 | Gift cards (purchase + redeem) | FULL | 🟡 TODO | Complex financial flow |
| F2-21 | Dark mode | FE | ✅ DONE | `useDarkMode.ts`, Navbar |
| F2-22 | Accessibility (WCAG 2.1 AA) | FE | 🟡 TODO | Incremental — ongoing |
| F2-23 | Live chat (WebSocket) | FULL | 🟡 TODO | Complex WebSocket infra |

### Phase 3: Scale — 2/12 Done

| ID | Feature | Stack | Status |
|---|---|---|---|
| F3-01 | Personalized homepage (collaborative filtering) | FULL | 🟡 TODO |
| F3-02 | Customer segmentation (RFM) | BE | 🟡 TODO |
| F3-03 | Email marketing automation | FULL | 🟡 TODO |
| F3-04 | Dynamic pricing engine | BE | 🟡 TODO |
| F3-05 | A/B testing framework | FULL | 🟡 TODO |
| F3-06 | Multi-language UI (Hindi + English) | FE | 🟡 TODO |
| F3-07 | Multi-language product content | FULL | 🟡 TODO |
| F3-08 | Subscription / repeat orders | FULL | 🟡 TODO |
| F3-09 | Supplier inventory sync | BE | 🟡 TODO |
| F3-10 | Blog / content CMS | FULL | ✅ DONE | `blog/`, `/blog`, `/blog/[slug]` |
| F3-11 | Landing page builder | FULL | ⏭ Deferred — too complex |
| F3-12 | Price history graph | FULL | ✅ DONE | `price-history/`, PDP bar chart |

### Phase 4: Innovation — 3/10 Done

| ID | Feature | Stack | Status |
|---|---|---|---|
| F4-01 | AI chatbot (Claude API + RAG) | FULL | 🟡 TODO |
| F4-02 | Visual search / image search | FULL | 🟡 TODO |
| F4-03 | Voice search (Web Speech API) | FE | ✅ DONE | `Navbar.tsx` |
| F4-04 | AR try-on (WebXR) | FE | 🟡 TODO |
| F4-05 | User-generated lookbooks | FULL | 🟡 TODO |
| F4-06 | Influencer collections | FULL | 🟡 TODO |
| F4-07 | Cashback promotions | FULL | ✅ DONE | CASHBACK coupon type, wallet credit on order |
| F4-08 | Tiered/volume discounts | FULL | ✅ DONE | `volume-discounts/`, PDP bulk discount UI |
| F4-09 | Live order tracking map | FULL | 🟡 TODO |
| F4-10 | Return label generation | FULL | 🟡 TODO |

---

## 2 — QA Coverage

**Run command**: `cd test && npx jest --runInBand --forceExit`  
**Total**: 638 tests / 39 spec files — all green.  
**Coverage**: ~80% of QA Master Plan scenarios (~220/282).

### Test Suite Breakdown

| Category | Files | Tests |
|---|---|---|
| Deep QA | 11 | 257 |
| API Integration | 11 | 178 |
| Phase-2+ Features | 7 | 84 |
| Other | 10 | 119 |
| **Total** | **39** | **638** |

### Known QA Gaps (~55 remaining)

**TODO-tier (backend exists, test missing — 12 scenarios):**

| ID | Scenario | Spec File | Priority |
|---|---|---|---|
| ORD-E22 | Reorder: OOS items excluded | e2e-lifecycle.spec.ts | P1 |
| PAY-H05 | Stripe refund → gateway COMPLETED | payment-deep.spec.ts | P1 |
| PAY-E04 | 3 retries → 15-min timeout → CANCELLING | payment-deep.spec.ts | P1 |
| PAY-F04 | Reconciliation cron finds gap payment | admin-cron.spec.ts | P2 |
| PAY-D04 | Wallet credit + gateway refund → 1 executes | payment-deep.spec.ts | P1 |
| REF-H03 | Stripe refund → gateway → COMPLETED | refund-deep.spec.ts | P1 |
| REF-E03 | Mixed payment refund: wallet instant + Stripe async | refund-deep.spec.ts | P1 |
| REF-F01/F02 | Stripe 500 → retry; 5 fails → FAILED_PERMANENT | refund-deep.spec.ts | P1 |
| INV-D04 | Admin adjust concurrent with reserve | concurrency-edge.spec.ts | P2 |
| ORD-D04 | User + admin cancel simultaneously | concurrency-edge.spec.ts | P2 |
| RES-D01 | Last unit race: 2 users → exactly 1 wins | concurrency-edge.spec.ts | P1 |
| ADM-H02 | CS_AGENT refund ≤ ₹5k (NEEDS-BE: route restriction) | maker-checker.spec.ts | P1 |

**NEEDS-BE tier (backend logic missing — 3 scenarios):**

| ID | What's Missing | Work |
|---|---|---|
| INV-E06 | DB CHECK constraint for reserved ≤ stock | Add CHECK in migration |
| ORD-H06 | PACKED cancel → 95% refund (cancellation fee) | Update cancelOrder logic |
| SHP-E01 | 3 failed deliveries → auto-RTO | Add failedAttempt counter |

**INFRA tier (toxiproxy/k6/Redis BullMQ — skip for now):**
31 scenarios requiring network fault injection, load testing, or full Redis BullMQ. See `test/QA_GAP_TRACKER.md`.

---

## 3 — Security Hardening

### H1 — Critical Fixes (19/19 DONE ✅)

JWT secret startup validation, server-authoritative tax/shipping, guest fraud check, maker-checker self-approval guard, coupon atomic expiry, webhook secret validation, trust proxy, idempotency key uniqueness, P2002 catch on coupon usage, CSP headers, loyalty clawback on refund, wallet lifetime cap, refresh token revocation, Helmet, per-user coupon tracking, PERCENTAGE coupon validation, coupon throttle, userId bug fixes.

### H2 — Hardening Wave (11/11 DONE ✅)

Account lockout (5 failed logins), body size limits (100kb/512kb), CORS production guard, required env vars at startup, fraud throttle, admin wallet credit reference, admin export pagination cap, admin export audit log, DTO validation tightening, SecurityAlert model, full CSP frameAncestors/objectSrc/baseUri.

### H3 — Phase 2 Deferred (14 items)

Email verification, CAPTCHA, Redis authentication, IP auto-blocklist, SecurityMonitorService, RBAC least-privilege, order idempotency key, impersonation correlation, progressive lockout escalation, admin export rate limit, distributed brute-force protection, refresh token revocation list, loyalty redeem guard, guest email encryption.

---

## 4 — YOU Tasks (Infra/Config — Requires Your Action)

| # | Task | Command | Unblocks |
|---|---|---|---|
| Y-01 | Start Redis + set `REDIS_URL` in `.env` | `redis-server` then add `REDIS_URL=redis://localhost:6379` | BullMQ queues |
| Y-02 | Redis password (prod) | `docker run -d -p 127.0.0.1:6379:6379 redis:7 --requirepass $(openssl rand -base64 32)` | Redis auth |
| Y-03 | DB connection limit | Add `?connection_limit=30` to `DATABASE_URL` in `.env` | Pool sizing |
| Y-04 | Apply pending migrations | `cd backend && npx prisma migrate deploy --schema=../prisma/schema.prisma` | perUserMaxQty, all schema additions |
| Y-05 | Set `CORS_ORIGIN` | `CORS_ORIGIN=https://your-domain.com` in prod `.env` | CORS guard |
| Y-06 | Set `NODE_ENV=production` | In prod deployment config | Prod-only guards, stack trace suppression |
| Y-07 | Revoke DB public schema | `REVOKE CREATE ON SCHEMA public FROM PUBLIC;` | Least-privilege DB |
| Y-08 | TLS/HTTPS (nginx or cloud LB) | Put NestJS behind HTTPS proxy | Secure transport |
| Y-09 | Set `STRIPE_WEBHOOK_SECRET` | From Stripe Dashboard → Webhooks | Payment webhooks |

---

## 5 — Launch Readiness

| Gate | Status | Notes |
|---|---|---|
| Core commerce flow | ✅ READY | Cart → Order → Pay → Fulfill → Return → Refund |
| Multi-warehouse routing | ✅ READY | Single-WH + split routing |
| Security hardening H1+H2 | ✅ READY | 30 controls implemented |
| Backend test suite | ✅ READY | 638 tests, ~80% coverage |
| Phase 1 features | ✅ READY | All 21 done |
| Phase 2 critical features | 🔴 BLOCKER | Razorpay (UPI), social login, WhatsApp — required for India market |
| Frontend E2E | ✅ Written | Needs staging server to run |
| Infra YOU tasks | 🔴 BLOCKER | Redis, connection limit, HTTPS, CORS, migrations |
| Payment gateway (India) | 🔴 BLOCKER | Razorpay F2-01 — Stripe alone captures <30% India market |

**Ship decision**: Ready to open source. NOT ready for production India launch until Razorpay (F2-01) and infra YOU tasks are done.
