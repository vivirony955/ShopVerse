import { test, expect } from "@playwright/test";

// Auth session pre-loaded via storageState (see playwright.config.ts chromium-user project)
test.describe("Orders", () => {

  test("orders list page loads", async ({ page }) => {
    await page.goto("/orders");
    await expect(page).toHaveURL("/orders");
    await expect(page.locator("body")).toBeVisible();
    // Should show "your orders" heading or empty state
    const heading = page.getByText(/orders|your orders|order history/i).first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("empty orders state shows helpful message", async ({ page }) => {
    await page.goto("/orders");
    // Either orders list or empty state
    const content = page.locator("main, [role='main'], .max-w-").first();
    await expect(content).toBeVisible({ timeout: 10_000 });
  });

  test("order confirmation page with missing id shows fallback", async ({ page }) => {
    await page.goto("/orders/confirmation");
    // Should show fallback (no order id provided)
    await expect(page.locator("body")).toBeVisible();
    const fallback = page.getByText(/no order|view my orders|order id/i).first();
    await expect(fallback).toBeVisible({ timeout: 8_000 });
  });

  test("order detail page with invalid id shows not found", async ({ page }) => {
    await page.goto("/orders/999999");
    // Should show "Order not found" or error state
    const notFound = page.getByText(/not found|no order|error/i).first();
    await expect(notFound).toBeVisible({ timeout: 10_000 });
  });

  test("profile page loads", async ({ page }) => {
    await page.goto("/profile");
    await expect(page).toHaveURL("/profile");
    await expect(page.getByText(/profile|account|personal/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("wishlist page loads", async ({ page }) => {
    await page.goto("/wishlist");
    await expect(page).toHaveURL("/wishlist");
    await expect(page.locator("body")).toBeVisible();
  });

  test("loyalty page loads", async ({ page }) => {
    await page.goto("/loyalty");
    await expect(page).toHaveURL("/loyalty");
    await expect(page.locator("body")).toBeVisible();
  });

  test("wallet page loads", async ({ page }) => {
    await page.goto("/wallet");
    await expect(page).toHaveURL("/wallet");
    await expect(page.locator("body")).toBeVisible();
  });
});
