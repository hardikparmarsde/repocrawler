import GitHub from "next-auth/providers/github";
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/signin",
  },
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      authorization: { params: { scope: "read:user user:email public_repo" } },
    }),
  ],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnApp =
        nextUrl.pathname.startsWith("/analyze") ||
        nextUrl.pathname.startsWith("/contributions") ||
        nextUrl.pathname.startsWith("/profile") ||
        nextUrl.pathname.startsWith("/evals");
      if (isOnApp) return isLoggedIn;
      return true;
    },
  },
} satisfies NextAuthConfig;
