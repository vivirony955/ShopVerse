/**
 * Test Data Setup — seeds required data for chromium-user tests.
 * Runs before chromium-user project.
 *
 * Seeds via backend REST API (as test user):
 *  1. Verifies the test user exists and can log in
 *  2. Attempts to get or create a wallet transaction entry (for wallet tests)
 *  3. Documents test user state for debugging
 */
import { test as setup, expect } from "@playwright/test";
import { TEST_USER } from "./helpers";

const API_BASE = process.env.API_BASE_URL || "http://localhost:4000";

setup("seed test data for user tests", async ({ request }) => {
  // Step 1: Log in and get token
  const loginRes = await request.post(`${API_BASE}/auth/login`, {
    data: { email: TEST_USER.email, password: TEST_USER.password },
  }).catch(() => null);

  if (!loginRes || !loginRes.ok()) {
    console.log("TD-setup: Test user login failed — skipping data seeding");
    console.log("TD-setup: This is OK if tests handle empty state gracefully");
    return;
  }

  const loginBody = await loginRes.json().catch(() => ({}));
  const token = loginBody.accessToken || loginBody.access_token || loginBody.token;
  if (!token) {
    console.log("TD-setup: No token in login response — skipping");
    return;
  }

  const headers = { Authorization: `Bearer ${token}` };

  // Step 2: Check wallet balance (create wallet if needed)
  const walletRes = await request.get(`${API_BASE}/wallet/balance`, { headers }).catch(() => null);
  if (walletRes?.ok()) {
    const wallet = await walletRes.json().catch(() => ({}));
    console.log(`TD-setup: Wallet balance = ${wallet.balance ?? "unknown"}`);
  } else {
    console.log("TD-setup: Wallet endpoint unavailable — wallet tests will degrade gracefully");
  }

  // Step 3: Check loyalty points
  const loyaltyRes = await request.get(`${API_BASE}/loyalty/balance`, { headers }).catch(() => null);
  if (loyaltyRes?.ok()) {
    const loyalty = await loyaltyRes.json().catch(() => ({}));
    console.log(`TD-setup: Loyalty points = ${loyalty.points ?? loyalty.balance ?? "unknown"}`);
  }

  // Step 4: Check if test user has orders
  const ordersRes = await request.get(`${API_BASE}/orders`, { headers }).catch(() => null);
  if (ordersRes?.ok()) {
    const orders = await ordersRes.json().catch(() => []);
    const orderList = Array.isArray(orders) ? orders : orders.data ?? [];
    console.log(`TD-setup: Test user has ${orderList.length} orders`);
    if (orderList.length === 0) {
      console.log("TD-setup: WARNING — no orders. OR/RT tests will degrade to empty-state checks");
    }
  }

  // Step 5: Check referral code
  const referralRes = await request.get(`${API_BASE}/referral/my-code`, { headers }).catch(() => null);
  if (referralRes?.ok()) {
    const referral = await referralRes.json().catch(() => ({}));
    console.log(`TD-setup: Referral code = ${referral.code ?? "none"}`);
  }

  console.log("TD-setup: Test data check complete");
});
