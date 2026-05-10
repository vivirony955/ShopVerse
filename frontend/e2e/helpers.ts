import { Page } from "@playwright/test";

export const TEST_USER = {
  email: "e2e_test@shopverse.local",
  password: "Test@1234",
  firstName: "E2E",
  lastName: "Tester",
};

export const TEST_ADMIN = {
  email: "e2e_admin@shopverse.local",
  password: "Admin@1234",
};

/**
 * Log in via the UI. Navigates to /login, fills credentials, submits.
 * Waits for redirect away from /login.
 */
export async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.locator('button[type="submit"]').click();
  // Wait until we're no longer on the login page
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15_000 });
}

/**
 * Log out via the UI (click user menu → sign out).
 * Tolerates if the session already expired.
 */
export async function logout(page: Page) {
  try {
    await page.getByRole("button", { name: /account|profile|user/i }).first().click();
    await page.getByText(/sign out|logout/i).click();
    await page.waitForURL("/");
  } catch {
    // already logged out
  }
}
