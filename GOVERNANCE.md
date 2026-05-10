# ShopVerse — Project Governance

## Model: BDFL (Benevolent Dictator For Life)

ShopVerse is currently maintained by a single maintainer: **Vivek Negi** ([@vivironycrazy](mailto:vivironycrazy@gmail.com)). All final decisions on architecture, licensing, releases, and roadmap rest with the maintainer.

This is the appropriate governance model for an early-stage open source project. Governance will evolve as the contributor base grows.

---

## Maintainers

| Name | Role | Contact |
|---|---|---|
| Vivek Negi | Principal Maintainer / BDFL | vivironycrazy@gmail.com |

**Responsibilities:**
- Final approval on all PRs touching financial, inventory, or security code
- Release management (tagging, changelog, migration guides)
- License and commercial decisions
- Security vulnerability triage and disclosure coordination
- Roadmap prioritization

---

## Decision Making

### Minor decisions (documentation, bug fixes, non-critical features)
→ Any contributor can submit a PR. Maintainer reviews and merges.

### Major decisions (new modules, schema changes, architecture changes)
→ Open a GitHub issue tagged `[RFC]` with the proposal. Discuss for at least 7 days. Maintainer makes final call.

### Critical decisions (license changes, breaking API changes, commercialization)
→ Announced 90 days in advance via GitHub issue, README notice, and email to known commercial licensees.

---

## Contribution Roles

| Role | How to Earn | Responsibilities |
|---|---|---|
| **Contributor** | Any merged PR | Can submit PRs, comment on issues |
| **Trusted Contributor** | 5+ merged PRs with quality | May be asked to review PRs in their domain |
| **Maintainer** | Invitation from BDFL after sustained, high-quality contributions | Can merge PRs in non-critical areas |

There is currently one maintainer. Maintainership is earned through demonstrated track record, not application.

---

## RFC Process (for Major Changes)

1. Open a GitHub issue with title: `[RFC] Your proposal title`
2. Describe: what, why, alternatives considered, impact on existing users
3. Discussion period: minimum 7 days (30 days for breaking changes)
4. Maintainer posts a decision: `[RFC ACCEPTED]`, `[RFC REJECTED]`, or `[RFC DEFERRED]`
5. If accepted: implementation PR follows the RFC, references the issue

---

## License Change Policy

Changing the license is a community-impacting event. Any license change:
- Will be announced **90 days in advance** via GitHub issue and README notice
- Will apply only to future versions, not retroactively to code already distributed
- Will be discussed as an RFC
- Will not remove rights that non-commercial users already have

The HashiCorp/Terraform → BUSL change of 2023 is the cautionary tale. We will not repeat it.

---

## Commercial Decisions

All commercial licensing decisions (pricing, new tiers, enterprise agreements) are made by the maintainer. They are not subject to community vote.

Community members may express opinions on pricing via GitHub discussions. The maintainer will consider these but is not bound by them.

---

## Code of Conduct

We follow the [Contributor Covenant](https://www.contributor-covenant.org/) v2.1. In short: be respectful, constructive, and professional. This is a technical platform; discussions should remain technical.

Report conduct issues to: vivironycrazy@gmail.com

---

## Conflict Resolution

1. Attempt good-faith discussion in the relevant GitHub issue
2. If unresolved, request maintainer decision via email
3. Maintainer decision is final

---

## Evolution

This governance document will be updated as the project grows. If ShopVerse gains multiple active maintainers, we will adopt a more democratic governance model (e.g., Technical Steering Committee). Any such change will follow the RFC process.
