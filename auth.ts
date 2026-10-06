import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  events: {
    // NextAuth v5 beta + Drizzle adapter occasionally fails to persist
    // access_token on subsequent OAuth re-authorizations. Force-update it here.
    async signIn({ user, account }) {
      if (
        account?.provider === "github" &&
        account.access_token &&
        user?.id
      ) {
        await db
          .update(accounts)
          .set({
            access_token: account.access_token,
            refresh_token: account.refresh_token ?? null,
            expires_at: account.expires_at ?? null,
            token_type: account.token_type ?? null,
            scope: account.scope ?? null,
          })
          .where(
            and(
              eq(accounts.userId, user.id),
              eq(accounts.provider, "github"),
            ),
          );
      }
    },
  },
});
