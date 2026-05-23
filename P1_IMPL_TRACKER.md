# P1 Implementation Tracker

## Session goal: implement remaining P1 backend features + tests, run full suite

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | `WithdrawDto` in wallet.dto.ts | ✅ DONE | `amount` with Min(0.01)/Max(100k) |
| 2 | `withdraw()` in wallet.service.ts | ✅ DONE | wraps `debit()` with unique withdrawal reference |
| 3 | `POST /api/wallet/withdraw` controller | ✅ DONE | JwtAuthGuard, userId from JWT |
| 4 | Fix `payment_intent.payment_failed` wallet reversal | ✅ DONE | fetches order, credits walletAmountUsed back |
| 5 | WAL-W01–W05 withdrawal tests in wallet-deep.spec.ts | ✅ DONE | balance check, overdraft, zero, 401, sequential |
| 6 | PAY-E05 updated to assert wallet IS restored | ✅ DONE | flipped from `< walletBalance` to `≈ walletBalance` |
| 7 | `npx tsc --noEmit` backend | ✅ DONE | Clean |
| 8 | Full test suite `cd test && npx jest --runInBand` | ✅ DONE | 43 suites / 687 tests all green |
| 9 | Commit + push | ⏳ PENDING | |

## Additional fixes applied during test runs
- `JwtAuthGuard` — added `@Public()` decorator support (Reflector-based skip)
- `@Public()` applied to `POST /api/orders/guest` endpoint
- `ReferralService.generateCode()` — now returns `referralCount: 0`
- `ReferralController.apply()` — added `@HttpCode(200)`
- `InvoicesService` — replaced `₹` with `Rs.` (WinAnsi cannot encode U+20B9)
- `InvoicesController` — passes `isAdmin` based on user role to `generateInvoice()`
- `cleanDatabase()` — added `pincodeServiceability`, `deliverySlot`, `InvoiceSequence` cleanup
- `GUE-H02` test corrected to check `availableStock = stock - reservedStock` (reserve model)

## P0 gap tests (completed in prior session)
- `test/delivery.spec.ts` — 10 tests (serviceability, waitlist, admin pincode CRUD)
- `test/invoices.spec.ts` — 8 tests (PDF download, ownership, I-13 sequence)
- `test/referral.spec.ts` — 8 tests (code generation, apply, self-referral, duplicate)
- `test/auth.spec.ts` — +4 tests (SEC-H01–H04: lockout, token version)
- `test/products.spec.ts` — +4 tests (NTFY-H01/H02, NTFY-E01/E02: stock notify)
- `test/guest-checkout.spec.ts` — 8 tests (GUE-H01–H03, GUE-E01–E06)
