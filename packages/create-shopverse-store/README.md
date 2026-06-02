# create-shopverse-store

Bootstrap a [ShopVerse](https://gitlab.com/aiexperts/ecommWeb) store
deployment for your market. Source-available under
[Business Source License 1.1](./LICENSE).

ShopVerse is a full application you **clone**, not a library you import —
so this tool does not generate app code. It configures an already-cloned
repo for one market: the env files (with the real variable names the app
boots with), a `store.config.json` mirroring the `StoreSettings`
singleton, and optional Railway / Render deploy blueprints.

## Usage

```bash
# from the root of a cloned ShopVerse repo
npx create-shopverse-store "Acme Outfitters"
```

```bash
# a fully-specified non-US store, with a Render blueprint
npx create-shopverse-store "Mumbai Mart" \
  --currency=INR --country=IN --locale=en-IN \
  --region=india --tax-rate=0.18 --free-shipping=500 --shipping-fee=49 \
  --render
```

| Option | Default | What it does |
|---|---|---|
| `--currency=<ISO>` | `USD` | ISO 4217 currency baked into `NEXT_PUBLIC_STORE_CURRENCY` + store config |
| `--country=<ISO>` | `US` | ISO 3166-1 alpha-2 country |
| `--locale=<BCP47>` | `en-US` | BCP 47 locale baked into `NEXT_PUBLIC_STORE_LOCALE` |
| `--region=<id>` | none | region-pack label (e.g. `india`, `us`); adds a next-step to enable it |
| `--tax-rate=<n>` | `0` | default tax **fraction** (`0.18` = 18%); ignored when a `TaxStrategy` pack is enabled |
| `--free-shipping=<n>` | `0` | free-shipping threshold |
| `--shipping-fee=<n>` | `0` | flat shipping fee |
| `--hide-badge` | off | sets `NEXT_PUBLIC_HIDE_POWERED_BY=true` — **only valid with a commercial license** |
| `--railway` | off | emit `railway.json` (backend service blueprint) |
| `--render` | off | emit `render.yaml` (Postgres + API + storefront blueprint) |
| `--repo-root=<dir>` | cwd | override repo-root detection |

## What it writes

| File | Purpose |
|---|---|
| `backend/.env` | every boot-required var (`DATABASE_URL`, `JWT_SECRET`, `STRIPE_*`) — `JWT_SECRET` generated dev-ready, the rest as `REPLACE_ME` |
| `frontend/.env.local` | `NEXT_PUBLIC_STORE_CURRENCY` / `_LOCALE` baked in, API + Stripe + badge vars |
| `store.config.json` | canonical store identity mirroring the `StoreSettings` singleton |
| `STORE_SETUP.md` | a per-store install → secrets → seed → run checklist |
| `railway.json` | *(with `--railway`)* backend Dockerfile build + `/api/health` probe |
| `render.yaml` | *(with `--render`)* full blueprint: db + api + web, currency baked, secrets `sync: false` |

The scaffolder is **filesystem-only** — it never runs `npm install`,
never touches the database, and **refuses to overwrite** an existing env
or config file (they may hold real secrets). Stripe keys and
`DATABASE_URL` are emitted as explicit `REPLACE_ME` placeholders you must
fill in; `JWT_SECRET` is generated so the backend boots immediately in
dev.

## After scaffolding

The CLI prints next steps; the full checklist lives in the generated
`STORE_SETUP.md`. In short: fill the secrets, match the `StoreSettings`
block in `backend/src/prisma/seed.ts` to `store.config.json`, migrate +
seed, then run the backend and frontend.

## License

[Business Source License 1.1](./LICENSE). Free for production use under
$100k/yr GMV (keep the "Powered by ShopVerse" badge); a
[commercial license](https://gitlab.com/aiexperts/ecommWeb/-/blob/main/COMMERCIAL_USAGE.md)
applies above the threshold. Each version converts to Apache 2.0 three
years after publication.
