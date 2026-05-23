# Security advisory template

Use this template when publishing a new security advisory under
Settings → Security → Advisories on GitHub (or the equivalent GitLab
flow).

The goal of the **first** advisory is to validate that the disclosure
channel works end-to-end, even for a low-severity finding. Do not wait
for a critical issue before exercising the pipeline.

---

## Title

`<Short, specific title>` — e.g. "Wallet transaction reference is logged
in plain text on debug log level."

Avoid generic titles like "Security fix in v0.1.2."

---

## Severity

Pick one (CVSS 3.1):

- **Critical** (9.0–10.0): remote code execution, full data exfiltration
- **High** (7.0–8.9): authentication bypass, privilege escalation, full
  account takeover
- **Medium** (4.0–6.9): logical bugs that lead to data exposure under
  specific conditions, rate-limit bypass, predictable secrets
- **Low** (0.1–3.9): info disclosure with limited impact, missing headers,
  verbose error messages

If unsure, default to **Medium** and have a security-aware contributor
review before publishing.

---

## Description

```
## Summary

<One-paragraph plain-English description of the issue. Avoid jargon.>

## Impact

<What can an attacker do? Be specific:
 - "An authenticated attacker can ..."
 - "An unauthenticated attacker can ..."
 - "An admin with role X but not Y can ...">

## Affected versions

- Affected: `v0.1.0` through `v0.1.2`
- Fixed in: `v0.1.3`

## Mitigation

If you cannot upgrade immediately:

<List concrete steps a operator can take to mitigate without
upgrading. Examples: revoke specific tokens, set a feature flag,
disable an endpoint at the reverse proxy.>

## Patch

<Link to the commit or PR that fixed the issue.>

## Credit

Reported by `<reporter handle / name / "anonymous">` on
`<date received via SECURITY.md channel>`.

## Timeline

- `YYYY-MM-DD`: Vulnerability reported to vivironycrazy@gmail.com
- `YYYY-MM-DD`: Acknowledged by maintainer
- `YYYY-MM-DD`: Fix developed and tested
- `YYYY-MM-DD`: Patch released as v0.1.3
- `YYYY-MM-DD`: Advisory published
```

---

## CWE classification

Reference a Common Weakness Enumeration ID if applicable. Common ones for
ecommerce backends:

- **CWE-89**: SQL injection (very unlikely with Prisma)
- **CWE-79**: Cross-site scripting
- **CWE-352**: CSRF
- **CWE-285**: Improper authorization
- **CWE-200**: Information exposure
- **CWE-307**: Improper restriction of excessive auth attempts
- **CWE-639**: Authorization bypass via user-controlled key (IDOR)
- **CWE-352**: Insufficient cryptographic strength

Full list: https://cwe.mitre.org/data/index.html

---

## CVE assignment

For Medium+ severity, request a CVE via GitHub Security Advisories' CVE
request flow. Low-severity issues do not need a CVE — link them by
GHSA-id only.

---

## Pre-publish checklist

- [ ] Fix has been merged to `main`
- [ ] A release tag containing the fix exists (e.g. v0.1.3)
- [ ] `CHANGELOG.md` references the GHSA-id under the version's
      `### Security` subsection
- [ ] Reporter has been credited (with their consent)
- [ ] Timeline reflects actual dates, not aspirational ones
- [ ] At least one non-author has reviewed the advisory text
- [ ] Mitigation steps tested against the unpatched version

---

## Post-publish

1. Tweet/post about the advisory with a link. Keep tone factual — not
   apologetic, not alarmist.
2. Update `SECURITY.md` to mention this advisory exists (a small "Past
   advisories" section linking out).
3. If the reporter was the first external security contributor, send
   them a personal thank-you — they may report again.
