import { test, expect } from "@playwright/test";
import { loginAs, TEST_USER } from "./helpers";

test.describe("Authentication", () => {
  test("homepage loads", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/shopverse|shop/i);
  });

  test("login page renders form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("#login-email")).toBeVisible();
    await expect(page.locator("#login-password")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("login with wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#login-email").fill("notexist@example.com");
    await page.locator("#login-password").fill("wrongpassword");
    await page.locator('button[type="submit"]').click();
    // Should stay on login or show error message
    await expect(page).toHaveURL(/login/);
  });

  test("register page renders form", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator("#reg-firstName")).toBeVisible();
    await expect(page.locator("#reg-email")).toBeVisible();
    await expect(page.locator("#reg-password")).toBeVisible();
  });

  test("login redirects to home/products", async ({ page }) => {
    // Backend throttle is 5 req/60s per IP. auth-extended (A-01..A-08) makes 6 login calls,
    // with the last one at ~63s into the suite. Wait 70s to clear the rolling 60s window.
    test.setTimeout(100_000);
    await page.waitForTimeout(70000);
    await loginAs(page, TEST_USER.email, TEST_USER.password);
    const url = page.url();
    expect(url).not.toContain("/login");
  });

  test("protected page (/orders) shows sign-in prompt when not authenticated", async ({ page }) => {
    await page.goto("/orders");
    // App uses client-side auth — stays at /orders but shows a sign-in prompt
    await expect(page.getByText(/sign in|please sign in|login/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
