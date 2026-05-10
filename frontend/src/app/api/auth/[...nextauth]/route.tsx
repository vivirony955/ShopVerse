// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import axios from "axios";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

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
            return {
              id:            String(res.data.user?.id ?? ""),
              email:         res.data.user?.email ?? credentials?.email,
              name:          [res.data.user?.firstName, res.data.user?.lastName].filter(Boolean).join(" ") || undefined,
              access_token:  res.data.access_token,
              refresh_token: res.data.refresh_token,
              role:          res.data.user?.role,
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
        token.accessToken  = (user as any).access_token;
        token.refreshToken = (user as any).refresh_token;
        token.role         = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).accessToken  = token.accessToken;
      (session as any).refreshToken = token.refreshToken;
      (session as any).role         = token.role;
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
