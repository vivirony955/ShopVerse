// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { authorizeCredentials } from "@/lib/auth-credentials";

// Custom field augmentations on User / Session / JWT live in
// src/types/next-auth.d.ts so they're visible to every callsite, not
// only this file. The credential-authorization logic (server-reachable URL,
// timeout, bad-creds vs backend-down distinction) lives in
// src/lib/auth-credentials.ts so it can be unit-tested.

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email:    { label: "Email",    type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        return authorizeCredentials(credentials?.email, credentials?.password);
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
      // Also surface role + id on session.user so server-side checks
      // like `session.user.role === "ADMIN"` keep working.
      if (session.user) {
        session.user.role = token.role;
        if (typeof token.sub === "string") session.user.id = token.sub;
      }
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
