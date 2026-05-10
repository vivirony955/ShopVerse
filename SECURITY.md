# Security Policy

## Supported Versions

| Version | Security Patches |
|---|---|
| 1.x (current) | ✅ Active |
| < 1.0 | ❌ Not supported |

---

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.** Public disclosure before a fix is available puts all deployments at risk.

**Contact:** vivironycrazy@gmail.com  
**Subject line:** `[SECURITY] ShopVerse — <brief description>`

Include in your report:
- Affected component (e.g., wallet service, auth, inventory)
- Steps to reproduce the vulnerability
- Potential impact assessment
- Your environment (Node version, DB version, OS)
- Any proof-of-concept code or screenshots

We will acknowledge your report within **48 hours** and provide a full assessment within **14 days**.

---

## Disclosure Timeline

| Step | SLA |
|---|---|
| Acknowledgement of report | 48 hours |
| Severity classification | 7 days |
| Fix development | 30 days (critical: 14 days) |
| CVE registration (if applicable) | After fix is ready |
| Public disclosure | After fix is deployed + 7 days |

We follow coordinated disclosure. Reporters who follow this process will be credited in the release notes (unless anonymity is preferred).

---

## Scope

### In Scope

- **Authentication**: JWT bypass, token forgery, session fixation, refresh token vulnerabilities
- **Financial flows**: Wallet credit manipulation, payment bypass, refund fraud, double-spend
- **Inventory**: Race conditions leading to oversell, reservation bypass
- **Authorization**: Admin privilege escalation, RBAC bypass, maker-checker circumvention
- **Data exposure**: PII leaks, order data exposure across users
- **Injection**: SQL injection via Prisma raw queries, XSS in admin panels
- **Fraud system**: Bypass of pre-order fraud scoring

### Out of Scope

- Attacks requiring physical access to the server
- Social engineering of maintainers or users
- Denial of service via resource exhaustion (unless trivially exploitable)
- Vulnerabilities in third-party dependencies — report those to the upstream maintainer
- Issues requiring a compromised admin account as a prerequisite
- Rate limiting bypass on non-security-critical endpoints

---

## Security Architecture (Summary)

ShopVerse includes the following security controls (H1+H2 hardening waves):

| Control | Implementation |
|---|---|
| JWT secret validation at startup | Throws if `JWT_SECRET` is weak or missing |
| Account lockout | 5 failed logins → 15-minute lockout |
| Refresh token revocation | Token version incremented on password change |
| Helmet security headers | HSTS, X-Frame-Options, X-Content-Type-Options |
| Content Security Policy | Strict CSP with no `unsafe-inline` |
| CORS guard | Throws at startup if `CORS_ORIGIN` not set in production |
| Request body limits | 100kb standard, 512kb for webhooks |
| Maker-checker approvals | CS agents cannot approve their own refund requests |
| Coupon atomic expiry | Conditional SQL prevents race condition on coupon use |
| Webhook signature verification | All Stripe webhooks verified with `STRIPE_WEBHOOK_SECRET` |
| Fraud pre-order scoring | Orders scored and optionally blocked before payment |
| Per-user coupon tracking | CouponUsage table prevents per-user limit bypass |
| Throttling | Auth endpoints: 10/min; fraud: 5/min; coupon validate: 10/min |
| Admin audit log | All sensitive admin actions recorded with actor, action, timestamp |

For full security threat model: see [SYSTEM_DESIGN_FINAL.md](SYSTEM_DESIGN_FINAL.md) §34–35.

---

## Dependency Security

We use automated dependency auditing:
- `npm audit` runs in CI on every PR
- Dependabot alerts are enabled on the GitHub repository
- Dependencies are reviewed quarterly for known CVEs

---

## Hall of Fame

Security researchers who responsibly disclose vulnerabilities will be acknowledged here (with permission).

*No reports yet — be the first.*
