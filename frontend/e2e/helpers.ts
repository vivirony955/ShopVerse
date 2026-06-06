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
  // Wait for a concrete post-login signal, not just the URL: the router pushes
  // away from /login on a successful signIn, then the login form detaches.
  // Confirming the form is gone guards callers from racing a half-rendered
  // destination (the URL can flip a beat before the new page is interactive).
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15_000 });
  await page
    .locator("#login-email")
    .waitFor({ state: "detached", timeout: 5_000 })
    .catch(() => {});
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
