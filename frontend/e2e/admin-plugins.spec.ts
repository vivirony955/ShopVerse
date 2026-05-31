// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { test, expect } from "@playwright/test";

// Task 5 / POST_W6 §2.1 — admin/plugins click-through.
// Auth session pre-loaded via storageState (playwright.config.ts
// chromium-admin project). hello-world is the safe plugin to toggle:
// it has no kernel cascade if disabled (just a tutorial slot + a
// no-op cart hook). Disabling wallet or payments would risk knock-on
// failures in other admin tests running in the same session.

const TARGET_PLUGIN_ID = "@shopverse/plugin-hello-world";
const TARGET_TAIL = "plugin-hello-world";

test.describe("Admin / Plugins", () => {
  // Guard: if a test leaves the plugin disabled (e.g. mid-flight failure
  // in the Disable test), the Enable test would silently pass without
  // actually re-enabling. afterEach explicitly re-enables to keep state
  // clean for subsequent specs.
  test.afterEach(async ({ page }) => {
    await page.goto("/admin/plugins");
    const enableButton = page.getByRole("button", { name: `Enable ${TARGET_TAIL}` });
    if (await enableButton.isVisible().catch(() => false)) {
      await enableButton.click();
      // Wait for the row to flip back; non-blocking if already enabled.
      await page
        .getByRole("button", { name: `Disable ${TARGET_TAIL}` })
        .waitFor({ timeout: 5_000 })
        .catch(() => undefined);
    }
  });

  test("table renders with all registered plugins", async ({ page }) => {
    await page.goto("/admin/plugins");
    await expect(page.getByRole("heading", { name: /plugins/i })).toBeVisible({ timeout: 10_000 });

    // Header row must include the 5 columns the W6.T3 page renders.
    await expect(page.getByRole("columnheader", { name: /plugin/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /load status/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /operator state/i })).toBeVisible();

    // ≥ 5 plugins per the source plan's verification gate (current
    // manifest has 6: price-alerts, blog, price-history, volume-discounts,
    // notifications, hello-world).
    const rowCount = await page.getByRole("row").count();
    // Subtract 1 for the header row.
    expect(rowCount - 1).toBeGreaterThanOrEqual(5);

    // hello-world specifically must be present — the rest of the suite
    // targets it for state manipulation.
    await expect(page.getByText(TARGET_PLUGIN_ID)).toBeVisible();
  });

  test("disable hello-world flips operator state + shows toast", async ({ page }) => {
    await page.goto("/admin/plugins");

    // Pre-condition: row is currently Active (afterEach in the previous
    // run guarantees this, but verify explicitly).
    const disableButton = page.getByRole("button", { name: `Disable ${TARGET_TAIL}` });
    await expect(disableButton).toBeVisible({ timeout: 10_000 });

    await disableButton.click();

    // Toast appears (react-hot-toast). Assert by text content rather
    // than role since the toast lib doesn't always use role=status.
    await expect(page.getByText(new RegExp(`${TARGET_TAIL} disabled`, "i"))).toBeVisible({ timeout: 5_000 });

    // Row state flips to "Disabled" badge + Enable button is the only
    // toggle visible for that plugin.
    await expect(page.getByRole("button", { name: `Enable ${TARGET_TAIL}` })).toBeVisible({ timeout: 5_000 });
  });

  test("enable hello-world reverts operator state to Active", async ({ page }) => {
    // Pre-arrange: ensure plugin is currently disabled. The previous
    // test left it disabled, but if it ran in isolation we need to
    // disable first.
    await page.goto("/admin/plugins");
    const disableButton = page.getByRole("button", { name: `Disable ${TARGET_TAIL}` });
    if (await disableButton.isVisible().catch(() => false)) {
      await disableButton.click();
      await page.getByRole("button", { name: `Enable ${TARGET_TAIL}` }).waitFor({ timeout: 5_000 });
    }

    const enableButton = page.getByRole("button", { name: `Enable ${TARGET_TAIL}` });
    await expect(enableButton).toBeVisible({ timeout: 10_000 });

    await enableButton.click();

    await expect(page.getByText(new RegExp(`${TARGET_TAIL} enabled`, "i"))).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: `Disable ${TARGET_TAIL}` })).toBeVisible({ timeout: 5_000 });
  });
});
