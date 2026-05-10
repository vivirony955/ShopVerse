import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import axios from "axios";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          const res = await axios.post(`${BASE}/auth/login`, {
            email: credentials?.email,
            password: credentials?.password,
          });
          if (res.data?.access_token) {
            // Decode JWT payload to extract user info (backend doesn't return user object)
            const [, b64] = res.data.access_token.split(".");
            const payload = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
            return {
              id: String(payload.sub ?? payload.username ?? credentials?.email ?? ""),
              email: payload.username ?? credentials?.email,
              name: undefined,
              access_token: res.data.access_token,
              refresh_token: res.data.refresh_token,
              role: payload.role,
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
        token.accessToken = (user as any).access_token;
        token.refreshToken = (user as any).refresh_token;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).accessToken = token.accessToken;
      (session as any).refreshToken = token.refreshToken;
      // Set role at both session.role AND session.user.role for compatibility
      (session as any).role = token.role;
      if (session.user) {
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };
