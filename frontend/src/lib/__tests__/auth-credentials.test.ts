// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import {
  authorizeCredentials,
  SERVICE_UNAVAILABLE,
  type AuthPoster,
} from "../auth-credentials";

const BASE = "http://backend:3001/api";

function jwt(payload: Record<string, unknown>): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64");
  return `header.${b64}.sig`;
}

function axiosError(status: number) {
  return { isAxiosError: true, response: { status } };
}

describe("authorizeCredentials", () => {
  it("returns a user with decoded sub/username/role on valid creds", async () => {
    const token = jwt({ sub: 7, username: "e2e@x.local", role: "ADMIN" });
    const post = jest
      .fn()
      .mockResolvedValue({ data: { access_token: token, refresh_token: "r" } });
    const user = await authorizeCredentials("e2e@x.local", "pw", {
      post: post as AuthPoster,
      base: BASE,
    });
    expect(user).toMatchObject({
      id: "7",
      email: "e2e@x.local",
      access_token: token,
      refresh_token: "r",
      role: "ADMIN",
    });
  });

  it("returns null on a 2xx response with no access_token", async () => {
    const post = jest.fn().mockResolvedValue({ data: {} });
    expect(
      await authorizeCredentials("a", "b", { post: post as AuthPoster, base: BASE }),
    ).toBeNull();
  });

  it("returns null on a 401 (wrong credentials)", async () => {
    const post = jest.fn().mockRejectedValue(axiosError(401));
    expect(
      await authorizeCredentials("a", "b", { post: post as AuthPoster, base: BASE }),
    ).toBeNull();
  });

  it("throws service_unavailable on a 5xx", async () => {
    const post = jest.fn().mockRejectedValue(axiosError(500));
    await expect(
      authorizeCredentials("a", "b", { post: post as AuthPoster, base: BASE }),
    ).rejects.toThrow(SERVICE_UNAVAILABLE);
  });

  it("throws service_unavailable on a network / timeout error", async () => {
    const post = jest
      .fn()
      .mockRejectedValue(new Error("timeout of 5000ms exceeded"));
    await expect(
      authorizeCredentials("a", "b", { post: post as AuthPoster, base: BASE }),
    ).rejects.toThrow(SERVICE_UNAVAILABLE);
  });

  it("bounds the request with a timeout", async () => {
    const post = jest
      .fn()
      .mockResolvedValue({ data: { access_token: jwt({ sub: 1 }) } });
    await authorizeCredentials("a", "b", {
      post: post as AuthPoster,
      base: BASE,
      timeoutMs: 5000,
    });
    expect(post).toHaveBeenCalledWith(
      "http://backend:3001/api/auth/login",
      { email: "a", password: "b" },
      { timeout: 5000 },
    );
  });
});
