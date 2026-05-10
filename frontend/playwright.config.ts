import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for ShopVerse frontend.
 * Requires: frontend dev server running on port 3000, backend on port 4000.
 *
 * Run: npx playwright test
 * UI:  npx playwright test --ui
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,  // keep false — tests share a single test user seed
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["html", { outputFolder: "playwright-report" }], ["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    // ── Setup: log in once, save session state ───────────────────────────────
    {
      name: "setup-user",
      testMatch: /user\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "setup-admin",
      testMatch: /admin\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "setup-test-data",
      testMatch: /test-data\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup-user"],
    },

    // ── Public tests (no auth required) ─────────────────────────────────────
    {
      name: "chromium-public",
      testMatch: [
        /auth\.spec\.ts/,
        /products\.spec\.ts/,
        /auth-extended\.spec\.ts/,
        /products-extended\.spec\.ts/,
        /flash-sales\.spec\.ts/,
        /compare\.spec\.ts/,
        /cross-cutting\.spec\.ts/,
        /pincode\.spec\.ts/,
      ],
      use: { ...devices["Desktop Chrome"] },
    },

    // ── Authenticated user tests ─────────────────────────────────────────────
    {
      name: "chromium-user",
      testMatch: [
        /cart-checkout\.spec\.ts/,
        /orders\.spec\.ts/,
        /cart-extended\.spec\.ts/,
        /orders-extended\.spec\.ts/,
        /profile\.spec\.ts/,
        /wishlist\.spec\.ts/,
        /wallet\.spec\.ts/,
        /loyalty\.spec\.ts/,
        /referral\.spec\.ts/,
        /support\.spec\.ts/,
        /review\.spec\.ts/,
        /return\.spec\.ts/,
        /payment\.spec\.ts/,
      ],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup-user", "setup-test-data"],
    },

    // ── Admin tests ──────────────────────────────────────────────────────────
    {
      name: "chromium-admin",
      testMatch: [
        /admin\.spec\.ts/,
        /admin-extended\.spec\.ts/,
      ],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/admin.json",
      },
      dependencies: ["setup-admin"],
    },
  ],
  // Uncomment to auto-start the dev server before tests:
  // webServer: {
  //   command: "npm run start",
  //   url: "http://localhost:3000",
  //   reuseExistingServer: !process.env.CI,
  // },
});
