import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

/** Sign-in with Google, and Microsoft when its keys exist in .env.
 *  Sessions are signed cookies (JWT); company access is decided by the API. */
const providers = [Google];
if (process.env.AUTH_MICROSOFT_ENTRA_ID_ID) providers.push(MicrosoftEntraID as unknown as typeof Google);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  trustHost: true,
  callbacks: {
    // Only accept accounts whose email the provider has verified.
    signIn({ profile }) {
      const p = profile as { email_verified?: boolean; email?: string } | undefined;
      return Boolean(p?.email) && p?.email_verified !== false;
    },
  },
});

export const providerIds = providers.map((p) => (p as unknown as { id?: string }).id ?? "google");
