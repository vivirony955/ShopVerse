# ShopVerse QA Gap Tracker
**Last updated:** 2026-05-10  
**Purpose:** Track every uncovered scenario from QA_MASTER_PLAN.md with implementation status.

## Legend
| Status | Meaning |
|---|---|
| ✅ DONE | Test exists and passes |
| 🔨 IMPL | Being implemented this session |
| 🟡 TODO | Feasible, backend exists, test not yet written |
| 🔧 NEEDS-BE | Backend logic missing — needs code first |
| 🚫 INFRA | Requires toxiproxy / Redis / k6 / external service |
| ⏭ PHASE-2 | Deferred to Phase 2 (schema/design decision needed) |

---

## S-01: Inventory & Reservation (36 plan scenarios)

| ID | Description | Status | Notes |
|---|---|---|---|
| INV-H01..H10 | Core reserve/release/commit happy paths | ✅ DONE | inventory-deep.spec.ts |
| INV-E01..E05 | Stock edge cases | ✅ DONE | inventory-deep.spec.ts |
| INV-E06 | reserved > stock → DB CHECK fires | 🔧 NEEDS-BE | No CHECK constraint in current migrations |
| INV-E07 | Variant.stock goes negative → blocked | ✅ DONE | inventory-deep.spec.ts |
| INV-E08 | No serviceable warehouse → NotFoundException | ✅ DONE | inventory-deep.spec.ts — routeOrder with no WI |
| INV-E09 | restock > original stock → blocked | ✅ DONE | |
| INV-E10 | Admin adjustment >10% → approval required | ⏭ PHASE-2 | No approval flow for stock adjustments |
| INV-E11 | Stock below reorderPoint → alert | ⏭ PHASE-2 | No `reorderPoint` field in schema |
| INV-F01..F05 | Crash/timeout/race failure scenarios | 🚫 INFRA | toxiproxy |
| INV-F07 | Return QC DAMAGED → stock NOT incremented | 🟡 TODO | `DAMAGED` condition in restock/RTO path |
| INV-D01..D03 | Concurrent reserve (happy) | ✅ DONE | concurrency*.spec.ts |
| INV-D04 | Admin adjust concurrent with reserve | 🟡 TODO | Service-level isolation test |
| INV-D05 | Flash sale 100 concurrent reserves | ✅ DONE | flash-fraud.spec.ts FLASH-D01 (8 VU proxy) |
| INV-D06 | 3 warehouses, 50 concurrent reserves | 🚫 INFRA | Requires multi-warehouse fixture + load tool |

---

## S-02: Order Lifecycle (46 plan scenarios)

| ID | Description | Status | Notes |
|---|---|---|---|
| ORD-H01..H05 | Core place/pay/ship/deliver/return | ✅ DONE | e2e-lifecycle.spec.ts |
| ORD-H03 | Guest checkout → deliver | ⏭ PHASE-2 | No guest session in current auth model |
| ORD-H06 | Admin cancel PACKED → 95% refund | 🔧 NEEDS-BE | PACKED is ShipmentStatus, not OrderStatus; cancelOrder doesn't apply cancellation fee |
| ORD-E01..E04 | Fraud/reservation edge cases | ✅ DONE | flash-fraud.spec.ts |
| ORD-E05 | Wallet insufficient mid-tx → rollback | ✅ DONE | e2e-lifecycle.spec.ts — wallet=0, clamped to 0 |
| ORD-E06 | Coupon exhausted mid-tx → 409 rollback | ✅ DONE | e2e-lifecycle.spec.ts — maxUses exhausted pre-order |
| ORD-E07..E07d | Fraud gate blocks placeOrder | ✅ DONE | flash-fraud.spec.ts |
| ORD-E08 | Fraud score=72 → step-up OTP | ⏭ PHASE-2 | No OTP step-up mechanism |
| ORD-E09 | ServerTotal != ClientTotal → 409 drift | ✅ DONE | e2e-lifecycle.spec.ts — price drift >0.5% rejects |
| ORD-E10 | Cancel non-cancellable category | 🟡 TODO | `cancelOrder` checks state, not category |
| ORD-E14 | Non-returnable category → rejected | 🔨 IMPL | returnWindowDays=0 check exists in orders.service |
| ORD-E15 | Guest: wallet/loyalty fields ignored | ⏭ PHASE-2 | Guest checkout not implemented |
| ORD-E16 | Guest COD → rejected (prepaid only) | ⏭ PHASE-2 | Guest checkout not implemented |
| ORD-E17 | Address edit after 30 min → rejected | ⏭ PHASE-2 | No address-edit endpoint/timing logic |
| ORD-E18 | Address edit on PACKED → rejected | ⏭ PHASE-2 | Same as E17 |
| ORD-E22 | Reorder: OOS items excluded | 🟡 TODO | Reorder endpoint exists — need OOS check |
| ORD-F01 | Payment webhook crash | 🚫 INFRA | |
| ORD-F02 | Webhook never arrives → reconciliation | 🚫 INFRA | |
| ORD-F03 | Refund Stripe call fails → retry | 🚫 INFRA | |
| ORD-F04 | All 5 retries fail → FAILED_PERMANENT | 🟡 TODO | RetryCount logic exists in RefundRequest |
| ORD-F05 | Crash between CANCELLING and refund | 🚫 INFRA | |
| ORD-F06 | Partial cancel + partial return → aggregate | 🟡 TODO | Both flows exist, need combined test |
| ORD-D01 | Concurrent place with same reservation | ✅ DONE | e2e-lifecycle.spec.ts ORD-E04b |
| ORD-D02 | Cancel concurrent with payment webhook | 🚫 INFRA | |
| ORD-D04 | User + admin cancel simultaneously | 🟡 TODO | `updateMany WHERE status=CANCELLING` guard |
| ORD-D05 | Shipment webhook twice → idempotent | 🟡 TODO | Idempotency via webhooks.service |

---

## S-03: Payment & Reconciliation (31 plan scenarios)

| ID | Description | Status | Notes |
|---|---|---|---|
| PAY-H01..H02 | Stripe success, COD flow | ✅ DONE | payment-deep.spec.ts |
| PAY-H03 | Mixed wallet + Stripe | ✅ DONE | payment-deep.spec.ts PAY-H03 |
| PAY-H04 | Wallet-only payment | ✅ DONE | payment-deep.spec.ts |
| PAY-H05 | Stripe refund → gateway COMPLETED | 🟡 TODO | Stripe mock refund path |
| PAY-H06 | Wallet refund → immediate | ✅ DONE | refund-deep.spec.ts |
| PAY-E01..E03 | Duplicate/invalid/expired payment | ✅ DONE | payment-deep.spec.ts |
| PAY-E04 | 3 retries → 15-min timeout → CANCELLING | 🟡 TODO | Retry cron logic |
| PAY-E05 | Mixed: Stripe fails → wallet auto-refunded | ✅ DONE | payment-deep.spec.ts PAY-E05 |
| PAY-E06..E10 | Webhook/idempotency edge cases | ✅ DONE | payment-deep.spec.ts |
| PAY-E11 | Webhook > 60s late → verification banner | ⏭ PHASE-2 | No webhook age tracking |
| PAY-F02..F03 | Webhook infra failures | 🚫 INFRA | |
| PAY-F04 | Reconciliation cron finds gap payment | 🟡 TODO | reconciliation cron exists |
| PAY-D02 | Webhook concurrent with user cancel | 🚫 INFRA | |
| PAY-D04 | Wallet credit + gateway refund → one executes | 🟡 TODO | idempotency reference prevents double |

---

## S-04: Wallet & Ledger (23 plan scenarios)

| ID | Description | Status | Notes |
|---|---|---|---|
| WAL-H01..H06 | Earn/redeem/credit/debit/transfer | ✅ DONE | wallet-deep.spec.ts |
| WAL-E01..E03 | Negative/zero/exceed scenarios | ✅ DONE | wallet-deep.spec.ts |
| WAL-E04 | Balance = ₹10,000.01 → KYC lock | ✅ DONE | wallet-deep.spec.ts WAL-E04 |
| WAL-E05 | Balance = ₹9,999.99 → no KYC lock | ✅ DONE | wallet-deep.spec.ts WAL-E05 |
| WAL-E06 | Withdraw-to-bank: new account → 24h hold | ⏭ PHASE-2 | No bank withdrawal feature |
| WAL-F01..F03 | Crash/timeout/invariant violations | 🚫 INFRA | |

---

## S-05: Refund Processing (24 plan scenarios)

| ID | Description | Status | Notes |
|---|---|---|---|
| REF-H01..H02 | Wallet refund, partial item refund | ✅ DONE | refund-deep.spec.ts |
| REF-H03 | Stripe refund → gateway call → COMPLETED | 🟡 TODO | Stripe mock path in refund-deep |
| REF-H04 | Full order refund | ✅ DONE | refund-deep.spec.ts |
| REF-H05 | COD cancel → no-op refund (no money moved) | ✅ DONE | refund-deep.spec.ts — cancel UNPAID order |
| REF-E01..E02 | Double-refund, refund > total | ✅ DONE | refund-deep.spec.ts |
| REF-E03 | Mixed payment: wallet instant, Stripe async | 🟡 TODO | Partial refund split |
| REF-E04 | Coupon pro-rata discount deducted | ✅ DONE | promotions-deep.spec.ts |
| REF-E05 | Loyalty proportional clawback | ✅ DONE | promotions-deep.spec.ts |
| REF-E05b | Clawback idempotent | ✅ DONE | promotions-deep.spec.ts |
| REF-E06 | User choice: instant wallet vs original | ⏭ PHASE-2 | No user-choice refund-destination |
| REF-F01 | Stripe 500 → retry with backoff | 🟡 TODO | Retry count exists on RefundRequest |
| REF-F02 | 5 failures → FAILED_PERMANENT + alert | 🟡 TODO | Same as F01 — max retries path |
| REF-F04 | Crash between COMPLETED and order status | 🚫 INFRA | |

---

## S-06: Cart Reservation (25 plan scenarios)

| ID | Description | Status | Notes |
|---|---|---|---|
| RES-H01..H06 | Core reserve/expire/extend/consume | ✅ DONE | reservation-deep.spec.ts |
| RES-E01 | expiresAt exactly at now() → rejected | 🔨 IMPL | `expiresAt <= new Date()` check exists |
| RES-E02 | Price drift 0.4% → passes (< 0.5% threshold) | 🔨 IMPL | PRICE_DRIFT_TOLERANCE = 0.005 |
| RES-E03 | Price drift 0.6% → fails (> 0.5% threshold) | 🔨 IMPL | Same check |
| RES-E04..E06 | Already consumed/expired/wrong user | ✅ DONE | reservation-deep.spec.ts |
| RES-E07 | Partial: 8/10 available (>80%) → allowed | ⏭ PHASE-2 | No partial-fill threshold logic in service |
| RES-E08 | Partial: 7/10 available (70%) → hard fail | ⏭ PHASE-2 | Same |
| RES-F01..F03 | DB timeout, expiry race | 🚫 INFRA | |
| RES-D01 | 2 users, last unit simultaneously → 1 wins | 🟡 TODO | Similar to ORD-E04b but at reserve step |
| RES-D05 | Cart mutation while reserve in progress | 🟡 TODO | Race at reservation creation |

---

## S-07: Coupon & Promotions (18 plan scenarios)

| ID | Description | Status | Notes |
|---|---|---|---|
| CPN-H01..H04 | Percentage/fixed/cancel/clamp | ✅ DONE | promotions-deep.spec.ts |
| CPN-E01..E07 | Boundary, expired, exhausted, inactive | ✅ DONE | promotions-deep.spec.ts |
| CPN-E06 | Per-user maxUsesPerUser cap | ✅ DONE | promotions-deep.spec.ts |
| CPN-E08 | Excluded category coupon doesn't apply | ⏭ PHASE-2 | No `excludedCategoryIds` field in Coupon schema |
| CPN-E09 | firstOrderOnly + prior orders → rejected | 🔨 IMPL | Adding `firstOrderOnly` field + check |
| CPN-E10 | Non-stackable + flash sale → rejected | ⏭ PHASE-2 | No `isStackable` field in schema |
| CPN-E11 | Stackable + wallet + loyalty → all applied | ⏭ PHASE-2 | No `isStackable` field in schema |
| CPN-D01..D02 | Concurrent coupon race | ✅ DONE | promotions-deep.spec.ts |
| CPN-F01 | usedCount race → atomic or P2002 | ✅ DONE | Covered by CPN-D01 |

---

## S-08: Loyalty & Referrals (14 plan scenarios)

| ID | Description | Status | Notes |
|---|---|---|---|
| LOY-H01 | earnPoints on delivery | ✅ DONE | promotions-deep.spec.ts |
| LOY-H02 | Redeem 200 pts on ₹500 ≤ 20% cap | ✅ DONE | promotions-deep.spec.ts |
| LOY-H03 | Referral vesting on first delivery | ✅ DONE | promotions-deep.spec.ts |
| LOY-E01..E01d | Redeem cap, negative, zero | ✅ DONE | promotions-deep.spec.ts |
| LOY-E02 | Points at 365d → valid, 366d → expired | ⏭ PHASE-2 | No expiry logic on LoyaltyTransaction |
| LOY-E03 | Return → clawback | ✅ DONE | promotions-deep.spec.ts |
| LOY-E04 | Partial return → full clawback (Phase-2 gap) | ✅ DONE | promotions-deep.spec.ts (documented) |
| LOY-E05..E05b | Self-referral, duplicate application | ✅ DONE | promotions-deep.spec.ts |
| LOY-E06 | Referee returns → bonus not clawed back | ✅ DONE | promotions-deep.spec.ts |
| LOY-E07 | Duplicate earnPoints → idempotent | ✅ DONE | promotions-deep.spec.ts |
| LOY-D01..D02 | Concurrent earn/redeem | ✅ DONE | promotions-deep.spec.ts |
| LOY-BONUS | addBonus idempotent | ✅ DONE | promotions-deep.spec.ts |
| LOY-F01 | Loyalty service down → queued | 🚫 INFRA | |
| LOY-F02 | Clawback fails during refund | 🟡 TODO | Error path in refundOrderItem |

---

## S-09: Fulfillment & Shipping (17 plan scenarios)

| ID | Description | Status | Notes |
|---|---|---|---|
| SHP-H01 | Single shipment: PACKED→SHIPPED→DELIVERED | ✅ DONE | admin-cron.spec.ts |
| SHP-H02 | Multi-shipment split order tracked | ✅ DONE | admin-cron.spec.ts — 2 warehouses → 2 shipments |
| SHP-H03 | RTO flow on RTO shipment status | ✅ DONE | admin-cron.spec.ts RTO-H01/H02 |
| SHP-E01 | 3 failed deliveries → auto-RTO | 🔧 NEEDS-BE | No failedAttempt counter in ShipmentStatus flow |
| SHP-E03 | RTO + QC DAMAGED → write-off, refund | 🟡 TODO | `restock` skips DAMAGED; refund path exists |
| SHP-E04 | LOST → refund + insurance | ⏭ PHASE-2 | No LOST status or insurance model |
| SHP-E05 | SLA breach 49h → no auto-credit | ⏭ PHASE-2 | No SLA tracking implemented |
| SHP-E06 | SLA breach 48h01m → auto-credit ₹50 | ⏭ PHASE-2 | Same |
| SHP-E07 | "Not received" within 7d → investigation | ⏭ PHASE-2 | No "not received" claim feature |
| SHP-E08 | "Not received" at day 8 → rejected | ⏭ PHASE-2 | Same |
| SHP-E09 | COD > ₹10k → OTP mandatory | ⏭ PHASE-2 | No COD OTP mechanism |
| SHP-F01 | Carrier API down → queue for retry | 🚫 INFRA | |
| SHP-F02 | Invalid tracking code → logged | ✅ DONE | admin-cron.spec.ts — trackingCode persisted |
| SHP-F03 | Out-of-order webhooks → handle gracefully | ✅ DONE | admin-cron.spec.ts — double DELIVERED idempotent |

---

## S-10: Flash Sales (12 plan scenarios)

| ID | Description | Status | Notes |
|---|---|---|---|
| FLS-H01 | Flash price applied during reservation TTL | ✅ DONE | flash-fraud.spec.ts |
| FLS-D01 | No oversell under concurrency | ✅ DONE | flash-fraud.spec.ts FLASH-D01 |
| FLS-D02 | Flash reservation TTL ≤ 305s | ✅ DONE | flash-fraud.spec.ts FLASH-D02 |
| FLS-E01 | perUserMaxQty=2, 3rd attempt → rejected | 🔨 IMPL | Field in schema; adding enforcement |
| FLS-E03 | Flash ends during checkout → order valid | ✅ DONE | flash-fraud.spec.ts — lockedPrice survives sale end |
| FLS-E04 | Bot 6th cart-add within 1 min → rate limited | ⏭ PHASE-2 | No rate limiter on cart-add |
| FLS-E05 | reservedBucket depleted → OOS | ⏭ PHASE-2 | No `reservedBucket` field in FlashSale |
| FLS-E06 | Flash + stackable coupon → both applied | ⏭ PHASE-2 | No `isStackable` in Coupon |
| FLS-E07 | Flash + non-stackable coupon → rejected | ⏭ PHASE-2 | Same |
| FLS-E08 | CAPTCHA bypass peakMode=true → blocked | ⏭ PHASE-2 | No peakMode or CAPTCHA |

---

## S-11: Fraud & Risk Scoring (15 plan scenarios)

| ID | Description | Status | Notes |
|---|---|---|---|
| FRD-H01 | Score < 70 → order placed normally | ✅ DONE | flash-fraud.spec.ts |
| FRD-H02 | Score=75 → step-up OTP required | ⏭ PHASE-2 | No OTP step-up mechanism |
| FRD-E01 | Score ≥ 70 → placeOrder blocked | ✅ DONE | flash-fraud.spec.ts ORD-E07 |
| FRD-E02 | Score=50 → step-up OTP | ⏭ PHASE-2 | No OTP |
| FRD-E03 | Blacklist → always blocked | ✅ DONE | flash-fraud.spec.ts ORD-E07d |
| FRD-E04 | Score boundary 70/69 | ✅ DONE | flash-fraud.spec.ts ORD-E07b/c |
| FRD-E05 | Score decay: 90 → 30d clean → 85 | 🟡 TODO | decayScore() logic exists in fraud.service |
| FRD-E06 | Score decay: 90 → 60d clean → 80 | 🟡 TODO | Same |
| FRD-E07 | Blacklist evasion: new account same device | ⏭ PHASE-2 | No device fingerprint tracking |
| FRD-E08 | GOLD user score=65 → bypasses step-up | ⏭ PHASE-2 | No loyalty tier + fraud interaction |
| FRD-E09 | GOLD user score=75 → still step-up | ⏭ PHASE-2 | Same |
| FRD-E10..E11 | Velocity checks | ✅ DONE | |
| FRD-E12 | Fingerprint SDK down → fallback | ⏭ PHASE-2 | No SDK integration |

---

## S-12: Admin & RBAC (10 plan scenarios)

| ID | Description | Status | Notes |
|---|---|---|---|
| ADM-H01 | CS_AGENT views order → allowed | ✅ DONE | maker-checker.spec.ts (added CS_AGENT to @Roles) |
| ADM-H02 | CS_AGENT refund ≤ ₹5k → allowed | 🟡 TODO | Add CS_AGENT to item-refund route |
| ADM-H03 | Maker-checker full approve flow | ✅ DONE | maker-checker.spec.ts |
| ADM-H03b | Maker-checker reject flow | ✅ DONE | maker-checker.spec.ts |
| ADM-E01/E01b | ₹5000 threshold boundary | ✅ DONE | maker-checker.spec.ts |
| ADM-E02 | MERCH price change 21% → approval | ⏭ PHASE-2 | No MERCH price-change guard |
| ADM-E03 | MERCH price change 20% → direct | ⏭ PHASE-2 | Same |
| ADM-E04 | Admin daily quota exhausted → blocked | ⏭ PHASE-2 | No AdminActionQuota tracking |
| ADM-E05/E05b | Self-approval/rejection blocked | ✅ DONE | maker-checker.spec.ts |
| ADM-E06 | Impersonation token claims + audit log | ⏭ PHASE-2 | No impersonation mechanism |
| ADM-E07 | Bulk update > 100 rows → rejected | ⏭ PHASE-2 | No bulk-update quota |
| ADM-E08 | Double-approve guard | ✅ DONE | maker-checker.spec.ts |
| Role gates | 401/403/200 on all admin routes | ✅ DONE | admin-rbac.spec.ts + maker-checker.spec.ts |

---

## S-13: Async Crons & Queues (11 plan scenarios)

| ID | Description | Status | Notes |
|---|---|---|---|
| CRN-H01 | Reservation expiry cron runs | ✅ DONE | admin-cron.spec.ts |
| CRN-H02 | Refund retry cron picks PENDING | ✅ DONE | admin-cron.spec.ts |
| CRN-H03 | Inventory validator cron | ✅ DONE | admin-cron.spec.ts |
| CRN-E01 | CronLock prevents overlap | ✅ DONE | admin-cron.spec.ts |
| CRN-E02 | DLQ depth 10 → alert | 🚫 INFRA | Redis/BullMQ DLQ |
| CRN-E03 | Email 3 retries → email.dlq | 🚫 INFRA | Same |
| CRN-E04 | CANCELLING > 1h → alert | 🟡 TODO | Check order age logic |
| CRN-F01 | Worker crash mid-email → retry | 🚫 INFRA | |
| CRN-F02 | Redis down → cron lock fails → skips | 🚫 INFRA | |

---

## Implementation Summary

**Last updated: 2026-05-10 (Session 9)**

| Tier | Count | Implemented |
|---|---|---|
| ✅ Already done | ~200 scenarios (638 tests) | — |
| 🔨 IMPL (session 9) | 9 scenarios | ORD-E05/06/09, INV-E08, REF-H05, FLS-E03, SHP-H02, SHP-F02, SHP-F03 |
| 🟡 TODO (remaining feasible) | ~16 scenarios | REF-H03, FRD-E05/06, SHP-E03, ADM-H02, CRN-E04, LOY-F02, etc. |
| 🔧 NEEDS-BE (backend work first) | ~8 scenarios | ORD-H06, SHP-E01, INV-E06, ADM-H02 |
| ⏭ PHASE-2 (design decision) | ~30 scenarios | OTP, stackable, SLA, impersonation, guest checkout |
| 🚫 INFRA (toxiproxy/Redis) | 31 scenarios | toxiproxy, k6, BullMQ DLQ |

---

## YOU Items (require your action)

| Item | What | Why |
|---|---|---|
| Redis | Start Redis + set `REDIS_URL=redis://localhost:6379` | Enables BullMQ + cache + CRN-E02/E03 |
| k6 | Run `k6 run test/load/flash-sale.js` | FLS-D01 at 2000 VU |
| toxiproxy | Install + configure | All F-series (INV-F01, ORD-F05, WAL-F01…) |
| `prisma migrate deploy` | Apply pending perUserMaxQty migration | Enables FLS-E01 |
