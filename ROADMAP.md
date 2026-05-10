# ShopVerse — Public Roadmap

This roadmap reflects the maintainer's current priorities. It is directional — dates are targets, not commitments. Community contributions can accelerate any item.

Last updated: 2026-05-10

---

## Current: v1.0 — Stable

**Status: Production-ready for India D2C ecommerce.**

### What's complete
- Full commerce flow: cart reservation → order → payment → fulfillment → return → refund
- Multi-warehouse inventory routing (single-WH and auto-split)
- Payment: Stripe, COD, internal Wallet with split payment
- Fraud scoring, maker-checker refund approvals, RBAC (ADMIN/CS_AGENT/SUPER_ADMIN)
- Phase 1 features (21/21): PG full-text search, facets, autocomplete, size chart, verified reviews, review voting, split payment, delivery slots, bulk CSV upload, admin export, skeleton loading, infinite scroll, social sharing, SEO
- Phase 2 partial (11/23): notification center, exchange flow, price alerts, price history, tiered loyalty, trending searches, customer Q&A, delivery rating, dark mode, voice search, cashback, volume discounts
- Security: H1+H2 hardening (30 controls) — account lockout, CSP, CORS guard, audit logs
- 638 backend integration tests against real PostgreSQL (~80% coverage)
- 215 Playwright E2E tests

---

## Near-term: v1.5 — India Payments & Communication (Q3 2026)

These are the critical blockers for production India launch:

| ID | Feature | Priority | Notes |
|---|---|---|---|
| F2-01 | **Razorpay integration** (UPI, net banking, cards) | P0 | 70%+ of India digital payments |
| F2-02 | UPI payment flow | P0 | Depends on F2-01 |
| F2-05 | Social login (Google + Apple) | P0 | |
| F2-08 | WhatsApp order updates (MSG91/Gupshup) | P0 | |
| F2-07 | Web push notifications | P1 | |
| F2-09 | SMS notifications (MSG91/Twilio) | P1 | |
| F2-03 | Saved payment methods (tokenized) | P1 | Depends on F2-01 |

**Community contribution welcome:** Razorpay integration is the highest-impact contribution possible. See the existing `payments.service.ts` pattern.

---

## Medium-term: v2.0 — Growth Features (Q4 2026)

| ID | Feature | Priority |
|---|---|---|
| F2-10 | Meilisearch (replaces PostgreSQL FTS) | P1 |
| F2-04 | EMI / Buy Now Pay Later | P1 |
| F2-15 | Review photos/videos | P1 |
| F2-16 | Product bundles / combo deals | P1 |
| F2-18 | Bank-specific offers (HDFC, ICICI) | P1 |
| F2-20 | Gift cards | P2 |
| F2-22 | Accessibility (WCAG 2.1 AA) | P1 |
| F2-23 | Live chat (WebSocket) | P2 |

---

## Long-term: v3.0 — Scale & Personalization (2027)

| ID | Feature | Priority |
|---|---|---|
| F3-01 | Personalized homepage (collaborative filtering) | P1 |
| F3-02 | Customer segmentation (RFM analysis) | P1 |
| F3-03 | Email marketing automation (drip campaigns) | P1 |
| F3-06 | Multi-language UI (Hindi + English) | P1 |
| F3-08 | Subscription / repeat orders | P1 |
| F3-04 | Dynamic pricing engine | P2 |
| F3-05 | A/B testing framework | P2 |

---

## Innovation: v4.0+ — AI & Advanced Features (Ongoing)

| ID | Feature | Priority |
|---|---|---|
| F4-01 | AI chatbot (Claude API + RAG over catalog + orders) | P1 |
| F4-02 | Visual search / image search (pgvector + CLIP) | P1 |
| F4-09 | Live order tracking map (Mapbox + Delhivery) | P2 |
| F4-04 | AR try-on (WebXR) | P2 |

---

## Infrastructure & Quality (Ongoing)

- Seed script with realistic sample data
- QUICKSTART → working store in < 10 minutes
- k6 load test results documented in PERFORMANCE.md
- OpenTelemetry tracing
- Prometheus metrics endpoint
- Plugin system documentation
- Security H3 items (email verification, CAPTCHA, Redis auth, IP blocklist)

---

## How to Influence the Roadmap

- **Open an issue** tagged `[RFC]` with a feature proposal
- **Submit a PR** — working code moves faster than feature requests
- **Commercial license holders** can request priority for specific features — email vivironycrazy@gmail.com

The maintainer prioritizes based on: India market impact, correctness/safety, implementation feasibility, and community demand.
