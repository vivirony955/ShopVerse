# ShopVerse — Public Novelty Disclosure & Prior Art Declaration

**Date of first public disclosure:** 2026-05-10  
**Author:** Vivek Negi (vivironycrazy@gmail.com)  
**Repository:** gitlab.com/aiexperts/ecommWeb  
**License:** Elastic License 2.0 (ELv2)

---

## Purpose of This Document

This document constitutes a **public disclosure** of novel technical approaches implemented in ShopVerse. Public disclosure establishes **prior art** as of the disclosure date, preventing any third party from subsequently obtaining patent protection on these techniques.

The author has chosen **not to file patents** on these approaches. Instead, this disclosure ensures these techniques remain freely available to the engineering community as prior art. No patent application has been filed, and none is planned.

> Under patent law in most jurisdictions (including India, USA, EU), a public disclosure before a patent application filing date bars the applicant from obtaining a valid patent on the disclosed subject matter. This document serves that function.

---

## Disclosed Techniques

### N-01: Conditional Inventory Reservation with Write-Through Cache Invalidation

**Summary:** A method for atomically reserving inventory across a multi-warehouse system using conditional SQL predicates combined with synchronous write-through cache invalidation within a single database transaction.

**Technical detail:**
- Primary store: `WarehouseInventory` table (authoritative source of truth per warehouse-variant pair)
- Cache: `Variant.stock` and `Variant.reservedStock` fields (read-optimised aggregate)
- Reservation predicate: `UPDATE "WarehouseInventory" SET reserved = reserved + qty WHERE (stock - reserved) >= qty AND variantId = $1 AND warehouseId = $2`
- On reservation success, cache updated within the same `prisma.$transaction()` block
- Release predicate: `SET reserved = GREATEST(0, reserved - qty)` to prevent negative drift from concurrent operations
- Commit (shipment): decrements both `stock` AND `reserved` atomically, maintaining invariant I-1

**Why novel:** Existing open-source ecommerce systems (Medusa.js, Saleor, WooCommerce, Magento) use optimistic locking (read-then-compare-then-write) or application-level deduplication for inventory mutations. The conditional predicate approach eliminates the check-then-act race condition at the SQL level without requiring explicit row locking (`SELECT FOR UPDATE`), and combines it with synchronous write-through cache invalidation to avoid stale aggregate reads.

**Disclosed in:** `backend/src/inventory/inventory.service.ts`, `backend/src/cart/cart-reservation.service.ts`, `backend/src/orders/orders.service.ts`

---

### N-02: 13-Invariant Enforcement Architecture for Financial Commerce Systems

**Summary:** A formal set of 13 mathematical invariants enforced jointly at the database constraint level and application service level, covering the complete financial and inventory state of an ecommerce platform.

**Technical detail:**

| Invariant | Statement |
|---|---|
| I-1 | `∑(WI.stock) + ∑(WI.reserved) == Variant.stockCache` per variant (write-through) |
| I-2 | `∑(WI.reserved)` per variant == `∑(OrderItem.qty)` for active orders |
| I-3 | `∑(WalletTransaction.signedAmount) == Wallet.balance` per user |
| I-4 | `∑(LedgerEntry.debit) - ∑(LedgerEntry.credit) == 0` (trial balance) |
| I-5 | `Order.total == ∑(item.price×qty) − discount + shipping + tax − wallet − loyalty` |
| I-6 | `PaymentReconciliation.gatewayRef` is unique (webhook idempotency) |
| I-7 | `∑(RefundRequest.amount WHERE COMPLETED) <= Order.total` |
| I-8 | `CartReservation.expiresAt > now()` for ACTIVE rows (cron enforced) |
| I-9 | `Coupon.usedCount <= Coupon.maxUses` (atomic increment) |
| I-10 | `DeliverySlot.bookedCount <= DeliverySlot.maxOrders` (atomic check) |
| I-11 | `RefundRequest` exists for every non-zero wallet credit (FK from WalletTransaction) |
| I-12 | `WalletTransaction.reference` unique per operation type (partial unique index) |
| I-13 | Invoice sequence number continuous per financial year (no gaps) |

An automated `InvariantValidator` service runs as a scheduled cron, verifies all invariants against live data, and logs violations with severity classification. Any invariant violation is treated as a P0 incident.

**Why novel:** The explicit codification of financial commerce invariants as a formal, machine-verifiable set — rather than implicit business logic scattered across services — is not present in existing open-source ecommerce platforms. The combination of database-level enforcement (unique constraints, foreign keys) with application-level verification (scheduled cron) and a formal invariant registry is the novel contribution.

**Disclosed in:** `backend/src/common/invariant-validator/invariant-validator.service.ts`, `SYSTEM_DESIGN_FINAL.md §2`

---

### N-03: Pre-Order Fraud Scoring Gate with Blacklist Propagation

**Summary:** A fraud scoring system that evaluates an order for fraud risk signals **before** a payment intent is created with the payment gateway, rather than after payment collection.

**Technical detail:**
- Fraud check is the first operation in `OrdersService.placeOrder()`, before any inventory reservation, coupon application, or Stripe API call
- Signals scored: user account age, order velocity (orders per hour), device fingerprint mismatch, billing/shipping address mismatch, IP geolocation anomaly, order value outlier, prior chargeback history
- Score threshold: configurable. High-score orders: auto-reject. Medium-score: flag for manual review.
- Blacklist propagation: flagged users are added to a `FraudBlacklist` with TTL; device fingerprints are cross-referenced across user accounts
- Consequence: fraudulent payment intents are never created, preventing gateway-level fraud fees and chargeback disputes

**Why novel:** Standard fraud detection in ecommerce (including Shopify, Stripe Radar) operates post-payment-intent or post-charge. Rejecting before payment intent creation eliminates gateway fees on fraudulent transactions (Stripe charges per intent creation even if the charge fails). The pre-intent gate combined with device fingerprint cross-account propagation is the novel combination.

**Disclosed in:** `backend/src/fraud/fraud.service.ts`, `backend/src/orders/orders.service.ts`

---

### N-04: Maker-Checker Refund Approval with Temporal Isolation

**Summary:** A two-actor refund approval workflow where the agent who initiates a refund request is cryptographically prevented from also approving it, enforced at the database query level with temporal audit logging.

**Technical detail:**
- `RefundRequest` model stores `createdByAgentId` (the CS agent who initiated)
- Approval query: `WHERE id = $1 AND createdByAgentId != $currentUserId AND status = 'PENDING_REVIEW'`
- The maker-checker constraint is in the SQL WHERE clause, not application-level if/else
- `AdminAuditLog` records both initiation and approval events with separate timestamps and actor IDs
- SUPER_ADMIN can override the constraint (documented, logged) for exceptional cases
- Automated alert if the same agent initiates and attempts approval within any 24-hour window

**Why novel:** Maker-checker is a known banking control. The novel aspect is encoding the isolation constraint directly in the database query predicate (not application-level) for tamper-resistance, combined with temporal anomaly detection (same agent, short window) as an additional control layer.

**Disclosed in:** `backend/src/admin/admin.service.ts`, `backend/src/orders/orders.service.ts` (refund approval flow)

---

### N-05: Multi-Signal Warehouse Scoring for Automatic Order Routing

**Summary:** An order routing algorithm that selects the optimal fulfillment warehouse(s) using a composite score computed in a single SQL query across multiple signals, with automatic split-shipment generation when no single warehouse can fulfill the complete order.

**Technical detail:**
- Signals per warehouse candidate: available inventory (stock − reserved), delivery cost to pincode, warehouse priority tier, estimated delivery days, current warehouse load (active shipments)
- Score formula: `score = (availability_weight × 1.0) + (cost_weight × normalized_cost) + (priority_weight × tier) + (speed_weight × normalized_days)`
- Computed via single `$queryRaw` across `WarehouseInventory` and `Warehouse` tables — no N+1 warehouse lookups
- Auto-split: if no single warehouse satisfies full order qty, algorithm partitions items across the minimum set of warehouses that collectively satisfy the order
- Split generates multiple `Shipment` records linked to one `Order`, each with independent tracking and fulfillment lifecycle

**Why novel:** Existing multi-warehouse ecommerce routing (Magento, Shopify Plus) uses rule-based waterfall logic (primary warehouse → overflow warehouse). The composite scoring function computed in a single SQL query, with automatic partition-minimizing split, treats warehouse selection as an optimization problem rather than a rule cascade.

**Disclosed in:** `backend/src/warehouse/warehouse.service.ts`, `backend/src/orders/orders.controller.ts` (routeOrder)

---

### N-06: Double-Entry Wallet Ledger with Partial Unique Index Idempotency

**Summary:** An internal digital wallet implementation using double-entry bookkeeping principles, with idempotency enforced via a partial unique index on `(walletId, reference, type)` rather than application-level deduplication.

**Technical detail:**
- Every balance change creates a `WalletTransaction` row with: `signedAmount` (positive = credit, negative = debit), `reference` (operation identifier), `type` (CREDIT/DEBIT)
- Wallet balance is never stored as a mutable field without a corresponding transaction — `Wallet.balance` is the materialized sum, kept consistent via atomic transaction blocks
- Idempotency: `@@unique([walletId, reference, type])` in Prisma schema (partial: excludes auto-generated system rows) → duplicate credits are caught by PostgreSQL unique constraint (P2002) and handled gracefully
- Split payment: order total is decomposed into wallet contribution + gateway contribution before payment intent creation; wallet hold is released if gateway payment fails
- Reconciliation: `∑(WalletTransaction.signedAmount)` for any wallet must equal `Wallet.balance` at all times (I-3)

**Why novel:** The use of a partial unique index (rather than application-level duplicate detection or full-table unique constraint) for wallet operation idempotency is the novel mechanism. It delegates deduplication to the database engine, making it atomic and immune to race conditions where two concurrent requests would both pass an application-level `findFirst()` check before either inserts.

**Disclosed in:** `backend/src/wallet/wallet.service.ts`, `prisma/schema.prisma` (WalletTransaction model)

---

### N-07: Cart Reservation TTL Lifecycle with Inventory Reconciliation

**Summary:** A cart reservation system where inventory is locked at add-to-cart time (not at checkout), with database-level TTL tracking and a background reconciliation cron that restores inventory from expired reservations without application-level double-accounting.

**Technical detail:**
- `CartReservation` rows are created with `expiresAt = now() + 15 minutes` when items are added to cart
- Inventory `reserved` counter is incremented at reservation time, not at checkout
- A cron (every 5 minutes) queries `WHERE status = 'ACTIVE' AND expiresAt < now()`, marks reservations EXPIRED, and releases the corresponding `WarehouseInventory.reserved` counter in the same transaction
- Checkout (`consume` operation): converts reservation from ACTIVE to CONSUMED, inventory stays reserved (now committed via order)
- Order cancellation: releases reservation (CONSUMED → triggers WI decrement of both `reserved` and `stock` for cancelled post-shipment, or just `reserved` for pre-shipment cancellation)
- Invariant I-8 enforced: no ACTIVE reservation may have `expiresAt < now()` — cron SLA is 5 minutes

**Why novel:** The combination of add-to-cart inventory locking (not checkout-time locking), cron-based TTL reconciliation with transactional inventory restoration, and the ACTIVE→CONSUMED→RELEASED lifecycle that maps to the order state machine is not present in existing open-source platforms. Most platforms lock inventory at checkout, creating a window where cart contents can become unavailable between add-to-cart and checkout.

**Disclosed in:** `backend/src/cart/cart-reservation.service.ts`, `backend/src/common/cron-lock/`

---

## Jurisdiction and Legal Effect

This document is published on **2026-05-10** under the Elastic License 2.0. Under Indian Patent Act (1970, as amended), Section 25(1)(b), public prior use or disclosure before the priority date of a patent application constitutes anticipatory prior art. This disclosure has the same effect in most patent jurisdictions worldwide through Article 54 of the European Patent Convention and 35 U.S.C. §102 (USA).

The techniques disclosed here are implemented in the ShopVerse codebase, which is publicly accessible. The implementation date of each technique is verifiable through the git history of this repository.

No patent has been filed by the author on any of the above techniques. This document is authored with the explicit intention of keeping these techniques in the public domain as prior art.

---

## Contact

Vivek Negi — vivironycrazy@gmail.com  
For questions about the technical implementations described above.
