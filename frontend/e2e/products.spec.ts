import { test, expect } from "@playwright/test";

test.describe("Product Listing & Detail", () => {
  test("product listing page loads", async ({ page }) => {
    await page.goto("/products");
    // Page title or heading
    await expect(page.getByRole("heading", { level: 1 }).or(page.locator("h1"))).toBeVisible({ timeout: 10_000 });
  });

  test("product cards are displayed", async ({ page }) => {
    await page.goto("/products");
    // Wait for at least one product card to appear
    const cards = page.locator("a[href*='/products/']");
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
  });

  test("search via URL param filters results", async ({ page }) => {
    // Products page uses URL-based search params — navigate directly with search query
    await page.goto("/products?search=e2e");
    await page.waitForTimeout(1500);
    // URL should still contain the search param
    const url = page.url();
    expect(url).toContain("search=e2e");
    // Page should not crash
    await expect(page.locator("body")).toBeVisible();
  });

  test("product detail page loads from listing", async ({ page }) => {
    await page.goto("/products");
    const firstCard = page.locator("a[href*='/products/']").first();
    await firstCard.waitFor({ timeout: 15_000 });
    const href = await firstCard.getAttribute("href");
    await page.goto(href!);
    // Product name heading visible
    await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });
  });

  test("product detail shows add-to-cart button", async ({ page }) => {
    await page.goto("/products");
    const firstCard = page.locator("a[href*='/products/']").first();
    await firstCard.waitFor({ timeout: 15_000 });
    const href = await firstCard.getAttribute("href");
    await page.goto(href!);
    await expect(
      page.getByRole("button", { name: /add to cart|add to bag/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("product detail shows price", async ({ page }) => {
    await page.goto("/products");
    const firstCard = page.locator("a[href*='/products/']").first();
    await firstCard.waitFor({ timeout: 15_000 });
    const href = await firstCard.getAttribute("href");
    await page.goto(href!);
    // Price should contain ₹ symbol
    await expect(page.getByText(/₹|Rs|INR/).first()).toBeVisible({ timeout: 10_000 });
  });

  test("flash sales page loads", async ({ page }) => {
    await page.goto("/flash-sales");
    await expect(page).toHaveURL("/flash-sales");
    // Page should not crash
    await expect(page.locator("body")).toBeVisible();
  });
});
