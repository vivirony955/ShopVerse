// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import axios from "axios";

// Augment NextAuth's User / Session / JWT shapes with the fields the
// backend hands us. Without these augmentations every read of
// access_token / refresh_token / role through the NextAuth callbacks
// would have to widen via `as any`. Declare-once-here keeps the casts
// out of the callback bodies and gives autocomplete to anyone reading
// `session.role` etc. later in the codebase.
declare module "next-auth" {
  interface User {
    access_token?: string;
    refresh_token?: string;
    role?: string;
  }
  interface Session {
    accessToken?: string;
    refreshToken?: string;
    role?: string;
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    role?: string;
  }
}

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

interface JwtPayloadShape {
  sub?: number | string;
  username?: string;
  role?: string;
}

/**
 * Decode the unverified JWT body so we can pull `sub` / `username` /
 * `role` out at sign-in time — the backend's login response carries
 * only `access_token` + `refresh_token`, not a user object.
 */
function decodeJwtPayload(token: string): JwtPayloadShape | null {
  const [, b64] = token.split(".");
  if (!b64) return null;
  try {
    const json = Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json) as JwtPayloadShape;
  } catch {
    return null;
  }
}

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email:    { label: "Email",    type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          const res = await axios.post(`${BASE}/auth/login`, {
            email:    credentials?.email,
            password: credentials?.password,
          });
          if (res.data?.access_token) {
            const payload = decodeJwtPayload(res.data.access_token);
            return {
              id:            String(payload?.sub ?? payload?.username ?? credentials?.email ?? ""),
              email:         payload?.username ?? credentials?.email ?? null,
              name:          null,
              access_token:  res.data.access_token,
              refresh_token: res.data.refresh_token,
              role:          payload?.role,
            };
          }
          return null;
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken  = user.access_token;
        token.refreshToken = user.refresh_token;
        token.role         = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken  = token.accessToken;
      session.refreshToken = token.refreshToken;
      session.role         = token.role;
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error:  "/login",
  },
  session: { strategy: "jwt" },
  secret:  process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };
