/**
 * Logs in as TEST_ADMIN once and saves browser storage state.
 * Used by test projects that need an authenticated admin user.
 */
import { test as setup } from "@playwright/test";
import { loginAs, TEST_ADMIN } from "./helpers";

setup("authenticate as admin", async ({ page }) => {
  await loginAs(page, TEST_ADMIN.email, TEST_ADMIN.password);
  await page.context().storageState({ path: "e2e/.auth/admin.json" });
});
