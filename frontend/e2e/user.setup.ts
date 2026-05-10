/**
 * Logs in as TEST_USER once and saves browser storage state.
 * Used by test projects that need an authenticated regular user.
 */
import { test as setup } from "@playwright/test";
import { loginAs, TEST_USER } from "./helpers";

setup("authenticate as user", async ({ page }) => {
  await loginAs(page, TEST_USER.email, TEST_USER.password);
  await page.context().storageState({ path: "e2e/.auth/user.json" });
});
