# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Public API stability is not guaranteed until v1.0.0. Breaking changes between
> minor versions (0.x → 0.y) are permitted and will be flagged here under
> a **Breaking** subsection.

---

## [Unreleased]

### Added
- `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1)
- `SUPPORT.md` — community + commercial support routing
- `CHANGELOG.md` (this file)
- `.github/dependabot.yml` — weekly grouped minor/patch dependency updates
- `.github/workflows/codeql.yml` — TypeScript static analysis
- SBOM generation step in CI (Syft)
- `.github/SECURITY-ADVISORY-TEMPLATE.md` — template for first security advisory
- `docs/runbooks/multi-region.md` — multi-region deployment architecture
- `docs/blog/launch.md` and `docs/blog/comparison.md` — draft launch + competitive posts
- `docs/internal/good-first-issues.md` — 5 candidate starter issues
- `docs/internal/social-preview-spec.md` — design brief for 1280×640 OG image

---

## [0.1.0] — 2026-05-23

First tagged release.

### Added
- 38 backend modules covering catalog, cart, orders, payments, inventory,
  wallet, loyalty, refunds, reviews, coupons, fraud, flash sales, referrals,
  delivery, invoices, and more
- 54+ Prisma models
- 687 integration tests against a real PostgreSQL 16 database
- Stripe payment integration with intent / capture / webhook reconciliation
- Cash-on-Delivery payment path with admin collection confirmation
- Internal wallet with double-entry ledger and lifetime balance cap
- Multi-warehouse inventory with TTL-based cart reservations
- Maker-checker refund approval for amounts above the configured threshold
- PDF invoice generation with sequential numbering per Indian financial year
- Guest checkout with rate-limiting and pre-order fraud screening
- Flash sales with atomic per-user purchase cap enforcement
- Referral system with self-referral block and unique credit per new user
- Pincode serviceability + delivery-slot booking with atomic capacity
- Hourly cron that verifies all 13 named invariants
- Wallet withdrawal endpoint with conditional-debit overdraft protection
- Mixed-payment wallet auto-reversal when the Stripe leg fails
- Account lockout after 5 failed logins; token-version field for forced re-auth
- Stock notify-back subscription endpoint
- Admin RBAC across Admin, CS-Agent, Finance, Ops, Merch, Super-Admin roles

### Infrastructure
- Docker Compose with Postgres 16 + Redis 7 + healthchecks
- Ansible playbook for VM-based deployment (PM2 + Nginx + Let's Encrypt)
- GitLab CI pipeline (validate / test / build / release / deploy)
- GitHub Actions CI (typecheck / lint / integration tests / schema validation)
- Prisma schema with squashed baseline + sequential post-baseline migrations

### Documentation
- `README.md` with feature matrix, comparison table, architecture diagrams
- `QUICKSTART.md` for Docker + manual setup paths
- `SYSTEM_DESIGN_FINAL.md` (33 sections, 1800+ lines) covering invariants,
  state machines, idempotency, observability targets, and SLAs
- `CONTRIBUTING.md`, `SECURITY.md`, `GOVERNANCE.md`
- 28 product screenshots in `docs/screenshots/`
- Runbooks for warehouse-inventory drift and flash-sale prep

### Licensing
- Source-available under the [Elastic License 2.0](LICENSE)
- Commercial-use terms in `COMMERCIAL_LICENSE.md` and `COMMERCIAL_USAGE.md`

---

[Unreleased]: https://gitlab.com/aiexperts/ecommWeb/-/compare/v0.1.0...main
[0.1.0]: https://gitlab.com/aiexperts/ecommWeb/-/releases/v0.1.0
