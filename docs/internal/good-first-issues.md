# Good first issue templates

Copy each block below into a new issue on GitLab/GitHub. Apply the listed
labels. These are scoped to be doable in 2–6 hours by a competent
developer who has cloned the repo and read `QUICKSTART.md`.

Order from easiest to hardest. Pick the ones whose scope still matches the
current repo state before posting — some may have been done by the time you
read this.

---

## Issue 1: Add a `Makefile` (or `justfile`) for one-command setup

**Title:** Add Makefile for one-command developer setup

**Labels:** `good first issue`, `developer-experience`

**Description:**

Setting up the project today requires running `npm install` in four
different directories (`/`, `/backend`, `/frontend`, `/test`), creating the
database, running migrations, and starting two processes. A new
contributor on Windows or macOS without the right shell setup will hit
friction.

Add a `Makefile` at the repo root with targets:

- `make install` — runs npm install in all four directories
- `make db` — createdb + migrations
- `make dev` — starts backend (3001) and frontend (3000) concurrently
- `make test` — runs the integration test suite
- `make lint` — runs eslint in backend

A `justfile` (https://github.com/casey/just) is acceptable as an
alternative — pick whichever the maintainer prefers in a comment.

**Acceptance criteria:**
- Fresh clone + `make install && make db && make dev` results in both
  servers running.
- The README "Getting Started" section is updated to reference the
  Makefile.
- Works on Linux and macOS at minimum (Windows via WSL acceptable).

---

## Issue 2: Document every cron job in one `docs/CRONS.md`

**Title:** Add `docs/CRONS.md` listing every scheduled job

**Labels:** `good first issue`, `documentation`

**Description:**

The backend has ~11 cron jobs (`@Cron` decorators) spread across
`backend/src/`. Grep for `@Cron` to find them. There's no single
document that lists what each cron does, how often it runs, and what
breaks if it doesn't run.

Create `docs/CRONS.md` with a table:

| Cron name | Schedule | What it does | Failure impact |
|---|---|---|---|
| ... | ... | ... | ... |

For each cron, link to the source file with the canonical path.

**Acceptance criteria:**
- Every `@Cron(...)` instance in `backend/src/` is listed.
- Schedule strings are interpreted (e.g., `0 * * * *` → "hourly").
- The doc is linked from the README under "Documentation."

---

## Issue 3: Add a Postman / Insomnia collection for the API

**Title:** Publish a Postman collection covering the customer-facing API

**Labels:** `good first issue`, `documentation`, `dx`

**Description:**

The API surface is documented in `SYSTEM_DESIGN_FINAL.md` §26 but there's
no clickable artifact a new developer can import and start hitting.

Generate a Postman (or Insomnia) collection covering at minimum:

- Auth (register / login / refresh)
- Products (list / detail)
- Cart (add / update / remove)
- Orders (place / list / detail / cancel)
- Wallet (me / credit / debit / withdraw)

Commit the export to `docs/postman/shopverse.postman_collection.json` and
link it from the README.

**Acceptance criteria:**
- Collection imports cleanly into Postman 10+.
- Auth flow has an example login that captures `access_token` into a
  variable for subsequent requests.
- A short `docs/postman/README.md` explains how to use it against a
  local dev server.

---

## Issue 4: Document each backend module's purpose in `docs/MODULES.md`

**Title:** Add per-module summary doc at `docs/MODULES.md`

**Labels:** `good first issue`, `documentation`

**Description:**

The backend has 38 modules under `backend/src/`. A new contributor opening
the repo sees a wall of folders and can't tell which are core and which
are auxiliary.

Create `docs/MODULES.md` with one paragraph per module:

- What it does (1 sentence)
- Public surface (controller endpoints or exported services)
- Dependencies (which other modules it imports)
- Status (production / experimental / planned)

Group by domain: Catalog, Cart & Orders, Payments & Finance, Inventory &
Fulfillment, Customer Experience, Admin & Ops, Infrastructure.

**Acceptance criteria:**
- All 38 modules covered.
- Each entry links to the module's directory.
- Linked from README and CONTRIBUTING.

---

## Issue 5: Add a `scripts/seed-demo.sh` for a "demo-ready" database

**Title:** Add demo-seed script for hosted demo + local exploration

**Labels:** `good first issue`, `developer-experience`

**Description:**

To support a hosted demo (planned) and to give new contributors realistic
data to explore the UI with, we need a script that resets the DB and
seeds:

- 1 admin user (`admin@demo.shopverse.dev` / `Demo@1234`)
- 1 customer user (`shopper@demo.shopverse.dev` / `Demo@1234`)
- 3 warehouses (Mumbai, Delhi, Bengaluru) with realistic pincode rules
- 10 products across 3 categories, with images from `docs/screenshots/`
- 1 flash sale running for the next 7 days
- 1 active coupon (`DEMO10`, 10% off)

Write the script in TypeScript at `backend/src/prisma/seed-demo.ts`,
following the existing `seed.ts` pattern. Add an `npm run seed:demo`
script.

**Acceptance criteria:**
- `npm run seed:demo` against a fresh DB produces a browsable demo within
  60 seconds.
- The admin and customer users can log in successfully.
- The flash sale shows products with discounted prices.
- A short note in `QUICKSTART.md` mentions the demo seed.
