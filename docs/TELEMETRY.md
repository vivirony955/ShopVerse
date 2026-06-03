<!--
Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
See LICENSE in the project root for license information.
-->

# Telemetry

ShopVerse collects **anonymous, opt-out** usage telemetry. It exists for two
reasons only:

1. **Count active installs** — so we know the project is being used and worth
   maintaining (the open-source equivalent of "monthly active").
2. **A coarse revenue *band*** — so a self-hosted store approaching the
   **$100k/yr GMV** license threshold can be reminded, instead of being
   surprised by it.

It is **never** used to identify you, your store, or your customers. There is
no personal data in it, by construction (see the payload below), and it is
trivially disabled.

---

## How to turn it off

Any **one** of these disables telemetry completely — no heartbeat is ever sent:

```bash
# ShopVerse-specific switch
SHOPVERSE_TELEMETRY_DISABLED=1

# The universal community opt-out standard (https://consoledonottrack.com)
DO_NOT_TRACK=1
```

Telemetry is also **off automatically** when `NODE_ENV=test`, and during any
short-lived process (migrations, CLIs, one-off scripts) that exits before the
first heartbeat is scheduled.

---

## Exactly what is sent

One small JSON document, at most once per day, to the collector. **This is the
entire payload** — there are no hidden fields. It is enforced in code by a strict
allowlist (`backend/src/telemetry/telemetry.types.ts`) and a unit test that runs
the project's PII scrubber over the payload and asserts it comes back unchanged.

```jsonc
{
  "schema": "shopverse.telemetry.v1",
  "anonymousId": "3f2504e0-4f89-41d3-9a0c-0305e82c3301", // random, per-install
  "sentAt": "2026-06-03T00:00:00.000Z",
  "edition": "community",
  "version": "0.1.0",                 // ShopVerse version
  "runtime": { "node": "v20.11.0", "platform": "linux", "arch": "x64" },
  "store": {
    "currency": "USD",                // store CONFIG, not a customer address
    "country":  "US",
    "region":   "us",                 // active region pack
    "locale":   "en-US"
  },
  "gmvBand": "lt_1k",                  // a BAND, never a number — see below
  "plugins": { "enabledCount": 6, "regionPack": "us" }
}
```

### The GMV band is a band, never a number

`gmvBand` is one of: `lt_1k`, `1k_10k`, `10k_50k`, `50k_100k`, `gte_100k`
(in your store's own currency, over a trailing 365 days). The actual revenue
figure is **never** computed into the payload or transmitted.

### What is deliberately **not** collected

No emails, names, phone numbers, or addresses. No customer, order, product, or
user records — not even counts of them. No hostnames, domains, URLs, IPs, or
free-text. No exact revenue.

---

## The anonymous id

`anonymousId` is a random UUID generated once and stored in
`.shopverse/telemetry-id` (gitignored). It is **not** derived from anything about
you — it only lets the collector avoid double-counting the same install.

- Pin it across ephemeral/container redeploys with `SHOPVERSE_TELEMETRY_ID=<uuid>`.
- Change where it's stored with `SHOPVERSE_TELEMETRY_DIR=/some/writable/dir`.
- On a read-only filesystem with no pinned id, a per-process id is used instead.

---

## Self-host the collector

Point telemetry at your own sink (or a black hole) with:

```bash
SHOPVERSE_TELEMETRY_ENDPOINT=https://your-collector.example.com/v1/heartbeat
```

---

## Guarantees

- Telemetry can **never** crash, block startup, or slow a request — every read
  and network call is wrapped, the send has a short timeout, and the scheduling
  timer is `unref()`'d so it never keeps the process alive.
- The **first** time an enabled install sends a heartbeat, it logs a one-line
  notice telling you it's on and how to turn it off.

Implementation: [`backend/src/telemetry/`](../backend/src/telemetry/).
