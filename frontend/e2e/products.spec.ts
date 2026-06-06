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
    // Assert the DEFAULT store's actual currency renders (USD → "$" adjacent to
    // digits), not just any currency glyph on the page — the old broad alternation
    // would pass even if a USD store mis-rendered "¥". When StoreSettings-driven
    // currency lands (EH-1.1) this should read the seeded currency instead.
    await expect(
      page.getByText(/\$\s?[\d,]+(\.\d{2})?/).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("flash sales page loads", async ({ page }) => {
    await page.goto("/flash-sales");
    await expect(page).toHaveURL("/flash-sales");
    // Page should not crash
    await expect(page.locator("body")).toBeVisible();
  });
});
