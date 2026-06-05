// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import axios from "axios";
import type { User } from "next-auth";
import { SERVER_API_BASE } from "@/lib/server-api";

interface JwtPayloadShape {
  sub?: number | string;
  username?: string;
  role?: string;
}

/**
 * Decode the unverified JWT body so we can pull `sub` / `username` / `role`
 * at sign-in time — the backend's login response carries only the tokens.
 */
export function decodeJwtPayload(token: string): JwtPayloadShape | null {
  const [, b64] = token.split(".");
  if (!b64) return null;
  try {
    const json = Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json) as JwtPayloadShape;
  } catch {
    return null;
  }
}

/** Distinct, non-secret signal the UI maps to "service unavailable, retry". */
export const SERVICE_UNAVAILABLE = "service_unavailable";

type LoginResponse = {
  data?: { access_token?: string; refresh_token?: string };
};
/** Minimal POST shape the authorizer needs (axios.post satisfies it). */
export type AuthPoster = (
  url: string,
  body: unknown,
  config: { timeout: number },
) => Promise<LoginResponse>;

export interface AuthorizeDeps {
  /** Injectable for tests. Defaults to axios.post. */
  post?: AuthPoster;
  /** Backend base URL. Defaults to the server-reachable SERVER_API_BASE. */
  base?: string;
  /** Per-request timeout (ms). Defaults to AUTH_HTTP_TIMEOUT_MS || 5000. */
  timeoutMs?: number;
}

/**
 * Authorize a credentials login against the backend.
 *
 *   valid creds              -> User
 *   bad creds (HTTP 401)     -> null   (NextAuth surfaces "CredentialsSignin")
 *   backend down / timeout / -> throws Error(SERVICE_UNAVAILABLE) so the failure
 *   5xx / network / parse        is logged + the UI can tell it apart from a
 *                                wrong password (instead of silently masking it)
 *
 * Always bounded by a timeout so a hung backend can't stall the login request.
 */
export async function authorizeCredentials(
  email: string | undefined,
  password: string | undefined,
  deps: AuthorizeDeps = {},
): Promise<User | null> {
  const post: AuthPoster = deps.post ?? axios.post;
  const base = deps.base ?? SERVER_API_BASE;
  const timeout =
    deps.timeoutMs ?? (Number(process.env.AUTH_HTTP_TIMEOUT_MS) || 5000);

  try {
    const res = await post(
      `${base}/auth/login`,
      { email, password },
      { timeout },
    );
    const accessToken: string | undefined = res.data?.access_token;
    if (!accessToken) return null;
    const payload = decodeJwtPayload(accessToken);
    return {
      id: String(payload?.sub ?? payload?.username ?? email ?? ""),
      email: payload?.username ?? email ?? null,
      name: null,
      access_token: accessToken,
      refresh_token: res.data?.refresh_token,
      role: payload?.role,
    };
  } catch (err) {
    // Wrong credentials: the backend answers 401 -> a normal auth failure.
    if (axios.isAxiosError(err) && err.response?.status === 401) return null;
    // Everything else (5xx / timeout / network / parse) is NOT the user's
    // fault — surface it distinctly so it's logged and the UI can differentiate.
    throw new Error(SERVICE_UNAVAILABLE);
  }
}
